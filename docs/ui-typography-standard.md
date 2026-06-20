# KRWMP Typography And Form Standard

This standard defines the shared typography and form control classes for KRWMP Portal pages. Use these classes instead of repeating Tailwind font, color, and spacing utilities in each module.

## Typography Hierarchy

| Purpose | Class | Standard |
| --- | --- | --- |
| Page title | `krwmp-page-title` | `text-3xl font-bold`, `#F9FAFB` |
| Section heading | `form-section-heading` | `text-xl font-semibold`, `#F9FAFB` |
| Field label | `form-label` | `text-sm font-medium`, `#E5E7EB` |
| Input value | `form-input`, `form-select`, `form-textarea` | `text-base font-normal`, `#F3F4F6` |
| Table text | `krwmp-table` | `text-sm` |
| Helper text | `form-helper` | `text-xs font-normal`, `#9CA3AF` |
| Error text | `form-error` | `text-xs font-medium`, `#FCA5A5` |

## Reusable Classes

```html
<h2 class="form-section-heading">Institution Information</h2>

<label class="form-label">
  Institution Name
  <input class="form-input" name="institution_name" placeholder="Department of Irrigation">
  <span class="form-helper">Use the official registered name.</span>
  <span class="form-error">Institution name is required.</span>
</label>

<label class="form-label">
  Status
  <select class="form-select" name="status">
    <option value="active">Active</option>
  </select>
</label>

<label class="form-label">
  Description
  <textarea class="form-textarea" name="description"></textarea>
</label>
```

## Control Rules

- Labels stay above controls and use `form-label`.
- Inputs, selects, and textareas use a consistent `44px` minimum height.
- Entered values use `16px` text and `#F3F4F6`.
- Placeholder text uses `16px` text and `#6B7280`.
- Helper text belongs directly under its related field.
- Error text uses `form-error` and should appear near the field it describes.
- Use native validation attributes and existing JavaScript validation logic.

## Compatibility

The older `krwmp-field`, `krwmp-input`, `krwmp-select`, `krwmp-textarea`, `krwmp-help-text`, and `krwmp-validation-message` classes are retained as aliases for generated JavaScript markup and older modules. New or refactored forms should use the `form-*` classes.
