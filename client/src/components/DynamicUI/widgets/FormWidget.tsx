// EX1.15: FormWidget — renders editable form fields from schema
// @see docs/phases/phase-ex1.md

import { useState, useCallback, useMemo } from 'react';
import type { z } from 'zod';
import type { FormWidgetSchema, FormFieldSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type FormWidgetType = z.infer<typeof FormWidgetSchema>;
type FormField = z.infer<typeof FormFieldSchema>;
type FormValues = Record<string, string | number | boolean>;
type FormErrors = Record<string, string>;

interface FormWidgetProps {
  widget: FormWidgetType;
  onSubmit?: (values: FormValues) => void;
}

export function FormWidget({ widget, onSubmit }: FormWidgetProps) {
  const { title, fields, groups, submitLabel, readOnly } = widget;

  // Initialize form values from field defaults
  const initialValues = useMemo(() => {
    const vals: FormValues = {};
    for (const field of fields) {
      vals[field.key] = field.value ?? '';
    }
    return vals;
  }, [fields]);

  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const setValue = useCallback((key: string, value: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Clear error on change
    setErrors((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return prev;
    });
  }, []);

  // Validate all fields
  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    for (const field of fields) {
      const val = values[field.key];
      const strVal = val == null ? '' : String(val);

      // Required check
      if (field.required && (val === '' || val === undefined || val === null)) {
        errs[field.key] = `${field.label} is required`;
        continue;
      }

      // Skip further validation if empty and not required
      if (strVal === '' && !field.required) continue;

      // Number validation
      if (field.type === 'number') {
        const numVal = Number(val);
        if (isNaN(numVal)) {
          errs[field.key] = `${field.label} must be a number`;
          continue;
        }
        if (field.min != null && numVal < field.min) {
          errs[field.key] = `${field.label} must be at least ${field.min}`;
          continue;
        }
        if (field.max != null && numVal > field.max) {
          errs[field.key] = `${field.label} must be at most ${field.max}`;
          continue;
        }
      }

      // Text length validation
      if (field.type === 'text' || field.type === 'textarea') {
        if (field.min != null && strVal.length < field.min) {
          errs[field.key] = `${field.label} must be at least ${field.min} characters`;
          continue;
        }
        if (field.max != null && strVal.length > field.max) {
          errs[field.key] = `${field.label} must be at most ${field.max} characters`;
          continue;
        }
        if (field.pattern) {
          try {
            if (!new RegExp(field.pattern).test(strVal)) {
              errs[field.key] = `${field.label} format is invalid`;
            }
          } catch {
            // Invalid regex pattern — skip validation
          }
        }
      }
    }
    return errs;
  }, [fields, values]);

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      onSubmit?.(values);
    }
  }, [validate, values, onSubmit]);

  // Render fields either grouped or ungrouped
  const groupedFields = useMemo(() => {
    if (!groups || groups.length === 0) {
      return [{ label: null, fields }];
    }

    const fieldMap = new Map(fields.map((f) => [f.key, f]));
    const grouped = groups.map((g) => ({
      label: g.label as string | null,
      fields: g.fieldKeys.map((k) => fieldMap.get(k)).filter(Boolean) as FormField[],
    }));

    // Add ungrouped fields
    const groupedKeys = new Set(groups.flatMap((g) => g.fieldKeys));
    const ungrouped = fields.filter((f) => !groupedKeys.has(f.key));
    if (ungrouped.length > 0) {
      grouped.push({ label: null, fields: ungrouped });
    }

    return grouped;
  }, [fields, groups]);

  return (
    <Card>
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? 'pt-0' : 'pt-4'}>
        <div className="space-y-6">
          {groupedFields.map((group, groupIdx) => (
            <div key={groupIdx}>
              {group.label && (
                <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                  {group.label}
                </h4>
              )}
              <div className="space-y-4">
                {group.fields.map((field) => (
                  <FieldRenderer
                    key={field.key}
                    field={field}
                    value={values[field.key] ?? ''}
                    error={submitted ? errors[field.key] : undefined}
                    readOnly={readOnly}
                    onChange={(v) => setValue(field.key, v)}
                  />
                ))}
              </div>
            </div>
          ))}

          {!readOnly && (
            <Button onClick={handleSubmit} size="sm">
              {submitLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Field Renderer ───────────────────────────────────────

function FieldRenderer({
  field,
  value,
  error,
  readOnly,
  onChange,
}: {
  field: FormField;
  value: string | number | boolean;
  error?: string;
  readOnly: boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  const id = `form-field-${field.key}`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {field.label}
        {field.required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>

      {field.type === 'boolean' ? (
        <div className="flex items-center gap-2">
          <Switch
            id={id}
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(checked)}
            disabled={readOnly}
          />
          {field.description && (
            <span className="text-xs text-muted-foreground">{field.description}</span>
          )}
        </div>
      ) : field.type === 'select' ? (
        <Select
          value={String(value)}
          onValueChange={(v) => onChange(v)}
          disabled={readOnly}
        >
          <SelectTrigger id={id} className="h-8 text-xs">
            <SelectValue placeholder={field.placeholder ?? 'Select...'} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === 'textarea' ? (
        <Textarea
          id={id}
          value={String(value)}
          placeholder={field.placeholder ?? undefined}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          className="text-xs min-h-[80px]"
        />
      ) : field.type === 'number' ? (
        <Input
          id={id}
          type="number"
          value={String(value)}
          placeholder={field.placeholder ?? undefined}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          disabled={readOnly}
          className="h-8 text-xs"
          min={field.min ?? undefined}
          max={field.max ?? undefined}
        />
      ) : (
        /* text (default) */
        <Input
          id={id}
          type="text"
          value={String(value)}
          placeholder={field.placeholder ?? undefined}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          className="h-8 text-xs"
        />
      )}

      {field.type !== 'boolean' && field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
