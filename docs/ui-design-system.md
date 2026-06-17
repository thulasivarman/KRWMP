# KRWMP UI Design System

Phase 1 defines a small, opt-in UI foundation for future frontend standardization. Existing pages are not refactored yet.

## Source

Shared classes live in:

```text
public/assets/css/style.css
```

All classes are namespaced with `krwmp-` to avoid accidental collisions with existing Tailwind-heavy pages and map-specific CSS.

## Design Tokens

The stylesheet exposes CSS variables for repeated values:

```css
--krwmp-color-bg: #020617;
--krwmp-color-surface: #0f172a;
--krwmp-color-border: #1e293b;
--krwmp-color-text: #f8fafc;
--krwmp-color-text-muted: #94a3b8;
--krwmp-color-primary: #059669;
--krwmp-color-danger: #e11d48;
--krwmp-radius-md: 0.5rem;
--krwmp-radius-lg: 0.75rem;
--krwmp-radius-xl: 1rem;
```

## Typography

Use these for consistent page and section hierarchy:

```html
<header class="krwmp-page-header">
  <p class="krwmp-eyebrow">Community Participation</p>
  <h1 class="krwmp-page-title">Community Issue Review</h1>
  <p class="krwmp-body-text">Review public reports and coordinate response actions.</p>
</header>
```

Recommended hierarchy:

- Page eyebrow: `krwmp-eyebrow`
- Page title: `krwmp-page-title`
- Section title: `krwmp-section-title`
- Body copy: `krwmp-body-text`
- Secondary helper text: `krwmp-help-text` or `krwmp-meta-text`

## Layout And Spacing

Use the page shell and stack helpers instead of page-specific spacing:

```html
<main class="krwmp-page krwmp-stack-lg">
  ...
</main>
```

Available helpers:

- `krwmp-stack-xs`
- `krwmp-stack-sm`
- `krwmp-stack-md`
- `krwmp-stack-lg`
- `krwmp-cluster`
- `krwmp-cluster-between`

## Panels And Cards

```html
<section class="krwmp-panel">
  <div class="krwmp-panel-header">
    <div>
      <h2 class="krwmp-section-title">Saved Records</h2>
      <p class="krwmp-help-text">Most recent records appear first.</p>
    </div>
    <button class="krwmp-btn krwmp-btn-secondary">Refresh</button>
  </div>
</section>
```

Use:

- `krwmp-panel` for major page sections
- `krwmp-card` for repeated items
- `krwmp-card-muted` for nested or supporting content

## Buttons

```html
<button class="krwmp-btn krwmp-btn-primary">Save Record</button>
<button class="krwmp-btn krwmp-btn-secondary">Cancel</button>
<button class="krwmp-btn krwmp-btn-danger">Delete</button>
<button class="krwmp-btn krwmp-btn-success">Approve</button>
<button class="krwmp-btn krwmp-btn-ghost">View Details</button>
<button class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Refresh</button>
<button class="krwmp-btn krwmp-btn-primary krwmp-btn-full">Submit</button>
```

Use primary buttons for one main action per panel. Use success for positive state transitions such as approve/complete, and danger only for destructive actions.

## Forms

```html
<form class="krwmp-form-grid">
  <label class="krwmp-field">
    Institution Name
    <input class="krwmp-input" name="institution_name" required>
    <span class="krwmp-help-text">Use the official registered name.</span>
    <span class="krwmp-validation-message">Institution name is required.</span>
  </label>

  <label class="krwmp-field">
    Status
    <select class="krwmp-select" name="status">
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>
  </label>

  <label class="krwmp-field">
    Notes
    <textarea class="krwmp-textarea" name="notes"></textarea>
  </label>
</form>
```

Use:

- `krwmp-field`
- `krwmp-input`
- `krwmp-select`
- `krwmp-textarea`
- `krwmp-checkbox`
- `krwmp-radio`
- `krwmp-label`
- `krwmp-validation-message`

Use native validation attributes and existing JavaScript validation rules. Add `aria-invalid="true"` or wrap the field in `krwmp-field-error` only when the current validation flow already marks a field invalid.

## Tables

```html
<div class="krwmp-table-wrap">
  <table class="krwmp-table krwmp-table-compact">
    <thead>
      <tr>
        <th>Name</th>
        <th>Status</th>
        <th class="text-right">Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Kelani Youth Volunteers</td>
        <td><span class="krwmp-badge krwmp-badge-success">Active</span></td>
        <td class="text-right">
          <div class="krwmp-table-actions">
            <button class="krwmp-btn krwmp-btn-sm krwmp-btn-secondary">Edit</button>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

Use `krwmp-table-empty` inside table cells for empty/loading rows.

```html
<tr>
  <td colspan="4" class="krwmp-table-empty">No records found.</td>
</tr>
```

## Cards And Data States

```html
<section class="krwmp-stat-grid">
  <article class="krwmp-stat-card">
    <p class="krwmp-stat-label">Active Organisations</p>
    <div class="krwmp-stat-value krwmp-stat-value-accent">42</div>
  </article>
</section>

<div class="krwmp-empty-state">No matching records found.</div>
<div class="krwmp-loading-state">Loading latest data...</div>
```

## Badges And Alerts

```html
<span class="krwmp-badge krwmp-badge-neutral">Draft</span>
<span class="krwmp-badge krwmp-badge-success">Resolved</span>
<span class="krwmp-badge krwmp-badge-warning">Under Review</span>
<span class="krwmp-badge krwmp-badge-danger">Rejected</span>
<span class="krwmp-badge krwmp-badge-info">Submitted</span>

<div class="krwmp-alert krwmp-alert-success">Saved successfully.</div>
<div class="krwmp-alert krwmp-alert-error">Unable to save record.</div>
<div class="krwmp-alert krwmp-alert-info">Loading latest data.</div>
```

## Pagination

```html
<nav class="krwmp-pagination" aria-label="Table pagination">
  <span class="krwmp-pagination-meta">Showing 1-10 of 42 records</span>
  <div class="krwmp-pagination-controls">
    <button class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Previous</button>
    <span>Page 1 of 5</span>
    <button class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Next</button>
  </div>
</nav>
```

## Modals

```html
<div class="krwmp-modal-backdrop">
  <section class="krwmp-modal" role="dialog" aria-modal="true" aria-labelledby="edit-title">
    <header class="krwmp-modal-header">
      <h2 id="edit-title" class="krwmp-modal-title">Edit Record</h2>
    </header>
    <div class="krwmp-modal-body">
      <p class="krwmp-body-text">Update the record details.</p>
    </div>
    <footer class="krwmp-modal-actions">
      <button class="krwmp-btn krwmp-btn-secondary">Cancel</button>
      <button class="krwmp-btn krwmp-btn-primary">Save</button>
    </footer>
  </section>
</div>
```

Use `krwmp-modal-sm`, `krwmp-modal-lg`, or `krwmp-modal-xl` for size variants. Use `krwmp-modal-close` for close buttons and `krwmp-confirmation-dialog` for destructive confirmation layouts.

Native browser `confirm()` calls should only remain where the current handler depends on synchronous confirmation. New confirmation flows should use the shared modal classes.

## GIS And Map Panels

```html
<section class="krwmp-map-panel krwmp-stack-sm">
  <header class="krwmp-map-panel-header">
    <h2 class="krwmp-map-panel-title">Location</h2>
  </header>
  <div data-location-map class="krwmp-location-map h-72"></div>
  <p data-location-status class="krwmp-status-label">Click the map to select a location.</p>
  <div class="krwmp-identify-panel">
    Selected boundary details appear here.
  </div>
</section>
```

Use:

- `krwmp-map-panel` for location pickers and GIS controls
- `krwmp-location-map` or `krwmp-map-canvas` for MapLibre containers
- `krwmp-identify-panel` for selected-location and identify result summaries
- `krwmp-layer-panel` for layer control panels
- `krwmp-map-popup` with the existing popup manager for MapLibre feature popups

## Implementation Guidance

Future refactors should migrate pages gradually:

1. Replace page shell/header classes first.
2. Replace repeated panel/card classes.
3. Replace buttons and form controls.
4. Replace table wrappers and badges.
5. Move generated JS markup to the same class vocabulary.

Do not mix old and new patterns inside the same small component once migration begins.
