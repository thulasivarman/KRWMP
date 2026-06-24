(() => {
  const DB_NAME = 'wis-field-app';
  const DB_VERSION = 1;
  const RECORD_STORE = 'pending_records';
  const PHOTO_STORE = 'pending_photos';

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(RECORD_STORE)) {
          const store = db.createObjectStore(RECORD_STORE, { keyPath: 'localId' });
          store.createIndex('moduleKey', 'moduleKey', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(PHOTO_STORE)) {
          const photoStore = db.createObjectStore(PHOTO_STORE, { keyPath: 'photoId' });
          photoStore.createIndex('recordLocalId', 'recordLocalId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function tx(storeName, mode, callback) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const result = callback(store);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function uid(prefix = 'local') {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  async function saveRecord(moduleKey, payload, photos = []) {
    const localId = uid('record');
    const record = {
      localId,
      moduleKey,
      payload,
      status: 'pending_sync',
      conflictStatus: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
      serverRecordId: null,
    };

    await tx(RECORD_STORE, 'readwrite', store => store.put(record));

    for (const file of photos) {
      if (!file || !file.size) continue;
      const photo = {
        photoId: uid('photo'),
        recordLocalId: localId,
        name: file.name,
        type: file.type,
        size: file.size,
        blob: file,
        createdAt: new Date().toISOString(),
      };
      await tx(PHOTO_STORE, 'readwrite', store => store.put(photo));
    }

    return record;
  }

  async function getRecords() {
    return tx(RECORD_STORE, 'readonly', store => requestToPromise(store.getAll()));
  }

  async function getPhotos(recordLocalId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PHOTO_STORE, 'readonly');
      const index = transaction.objectStore(PHOTO_STORE).index('recordLocalId');
      const request = index.getAll(recordLocalId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function updateRecord(record) {
    record.updatedAt = new Date().toISOString();
    await tx(RECORD_STORE, 'readwrite', store => store.put(record));
    return record;
  }

  async function deleteRecord(localId) {
    const photos = await getPhotos(localId);
    await tx(PHOTO_STORE, 'readwrite', store => {
      photos.forEach(photo => store.delete(photo.photoId));
    });
    await tx(RECORD_STORE, 'readwrite', store => store.delete(localId));
  }

  window.WIS_FIELD_STORE = {
    saveRecord,
    getRecords,
    getPhotos,
    updateRecord,
    deleteRecord,
  };
})();
