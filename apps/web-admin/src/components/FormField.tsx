import { type ReactElement, cloneElement, useId } from "react";

export function FormField({
  label,
  children,
}: { label: string; children: ReactElement<{ id?: string; "aria-labelledby"?: string }> }) {
  const id = useId();
  return (
    <div>
      <label
        id={id}
        htmlFor={`${id}-control`}
        className="mb-1 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      {cloneElement(children, { id: `${id}-control`, "aria-labelledby": id })}
    </div>
  );
}
