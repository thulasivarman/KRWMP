'use strict';

const VALID_STATUS_VALUES = new Set([
  'draft',
  'submitted',
  'pending_review',
  'under_review',
  'needs_revision',
  'approved',
  'verified',
  'rejected',
  'sync_conflict',
]);

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isValidLatitude(value) {
  const n = toNumber(value);
  return n !== null && n >= -90 && n <= 90;
}

function isValidLongitude(value) {
  const n = toNumber(value);
  return n !== null && n >= -180 && n <= 180;
}

function isFutureDate(value) {
  const text = cleanText(value);
  if (!text) return false;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date.getTime() > today.getTime();
}

function addError(errors, field, message) {
  errors.push({ field, message });
}

function addWarning(warnings, field, message) {
  warnings.push({ field, message });
}

function result(moduleName, errors, warnings, normalized = {}) {
  return {
    module_name: moduleName,
    valid: errors.length === 0,
    errors,
    warnings,
    normalized,
    checked_at: new Date().toISOString(),
  };
}

function assertValid(validation) {
  if (validation.valid) return validation;
  const message = validation.errors.map(error => `${error.field}: ${error.message}`).join('; ');
  const err = new Error(message || 'Submission validation failed.');
  err.statusCode = 400;
  err.validation = validation;
  throw err;
}

function validateCommonSpatialFields(fields = {}, errors, warnings) {
  if (!isValidLatitude(fields.latitude)) addError(errors, 'latitude', 'A valid latitude between -90 and 90 is required.');
  if (!isValidLongitude(fields.longitude)) addError(errors, 'longitude', 'A valid longitude between -180 and 180 is required.');

  if (!cleanText(fields.dsd_name)) addWarning(warnings, 'dsd_name', 'DSD was not detected or selected.');
  if (!cleanText(fields.gnd_name)) addWarning(warnings, 'gnd_name', 'GND was not detected or selected.');
  if (!cleanText(fields.sub_watershed_id) && !cleanText(fields.sub_watershed_name)) {
    addWarning(warnings, 'sub_watershed', 'Sub-watershed was not detected or selected.');
  }
}

function validateCommunityIssueSubmission(fields = {}, options = {}) {
  const errors = [];
  const warnings = [];
  const issueId = toNumber(fields.issue_id);
  const categoryId = toNumber(fields.category_id);
  const otherCategoryName = cleanText(fields.other_category_name);
  const otherIssueName = cleanText(fields.other_issue_name);
  const issueTitle = cleanText(fields.issue_title) || otherIssueName || otherCategoryName;
  const description = cleanText(fields.description);

  if (!issueTitle || issueTitle.length < 3) addError(errors, 'issue_title', 'Issue title or other issue name must be at least 3 characters.');
  if (!description || description.length < 10) addError(errors, 'description', 'Description must be at least 10 characters.');
  if (!categoryId && !issueId && !otherCategoryName && !otherIssueName) {
    addError(errors, 'issue_category', 'Select a category/specific issue or describe the issue under Other.');
  }

  validateCommonSpatialFields(fields, errors, warnings);

  if (isFutureDate(fields.submitted_at || fields.reported_at || fields.inspection_date)) {
    addError(errors, 'date', 'Submission/reporting date cannot be in the future.');
  }

  if (!options.hasPhoto && !cleanText(fields.photo_url) && !cleanText(fields.attachment_ids)) {
    addWarning(warnings, 'photo', 'No field photo/evidence was attached. Reviewer should verify evidence availability.');
  }

  return result('community_issue_report', errors, warnings, {
    latitude: toNumber(fields.latitude),
    longitude: toNumber(fields.longitude),
    issue_title: issueTitle,
    category_id: categoryId,
    issue_id: issueId,
  });
}

function validateStatusValue(status, errors, field = 'status') {
  const text = cleanText(status);
  if (text && !VALID_STATUS_VALUES.has(text)) addError(errors, field, `Unsupported status value: ${text}.`);
}

function validateInterventionSubmission(fields = {}) {
  const errors = [];
  const warnings = [];
  const title = cleanText(fields.intervention_title || fields.title || fields.action_title);
  if (!title || title.length < 3) addError(errors, 'intervention_title', 'Intervention title must be at least 3 characters.');
  validateCommonSpatialFields(fields, errors, warnings);
  if (fields.start_date && fields.end_date && new Date(fields.start_date) > new Date(fields.end_date)) {
    addError(errors, 'end_date', 'End date cannot be earlier than start date.');
  }
  validateStatusValue(fields.status, errors);
  return result('intervention', errors, warnings, { intervention_title: title });
}

function validatePollutionSourceSubmission(fields = {}) {
  const errors = [];
  const warnings = [];
  const sourceName = cleanText(fields.source_name || fields.pollution_source_name || fields.title);
  if (!sourceName || sourceName.length < 3) addError(errors, 'source_name', 'Pollution source name must be at least 3 characters.');
  if (!cleanText(fields.source_type || fields.pollution_type || fields.category)) addError(errors, 'source_type', 'Pollution/source type is required.');
  validateCommonSpatialFields(fields, errors, warnings);
  return result('pollution_source', errors, warnings, { source_name: sourceName });
}

function validateMonitoringSubmission(fields = {}) {
  const errors = [];
  const warnings = [];
  if (!cleanText(fields.parameter || fields.parameter_name)) addError(errors, 'parameter', 'Monitoring parameter is required.');
  if (toNumber(fields.value) === null && toNumber(fields.result_value) === null) addError(errors, 'value', 'Monitoring value must be numeric.');
  if (!cleanText(fields.unit)) addError(errors, 'unit', 'Monitoring unit is required.');
  if (isFutureDate(fields.sample_date || fields.monitoring_date)) addError(errors, 'sample_date', 'Monitoring/sample date cannot be in the future.');
  validateCommonSpatialFields(fields, errors, warnings);
  return result('monitoring_record', errors, warnings, {});
}

function validateKnowledgeSubmission(fields = {}) {
  const errors = [];
  const warnings = [];
  const title = cleanText(fields.title || fields.content_title);
  if (!title || title.length < 3) addError(errors, 'title', 'Knowledge title must be at least 3 characters.');
  if (!cleanText(fields.content_type || fields.category_id)) addError(errors, 'content_type', 'Content type or category is required.');
  validateStatusValue(fields.status, errors);
  if (!cleanText(fields.file_url) && !cleanText(fields.attachment_ids) && !cleanText(fields.body)) {
    addWarning(warnings, 'content', 'No document, attachment, or content body was supplied.');
  }
  return result('knowledge_content', errors, warnings, { title });
}

module.exports = {
  assertValid,
  validateCommunityIssueSubmission,
  validateInterventionSubmission,
  validatePollutionSourceSubmission,
  validateMonitoringSubmission,
  validateKnowledgeSubmission,
};
