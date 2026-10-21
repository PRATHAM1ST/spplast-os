"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Inbox, LoaderCircle } from "lucide-react";
import { Button } from "./button";
import { cn, humanize } from "@/lib/utils";
import { cloneElement, isValidElement, useId, type ReactNode } from "react";
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={cn("modal", wide && "modal-wide", className)}
        >
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description ||
                  "Enter the details below. Changes are saved only when submitted."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X size={20} />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const generated = useId();
  const child = isValidElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>(children)
    ? children
    : null;
  const id = child?.props.id || generated;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {child
        ? cloneElement(child, {
            id,
            "aria-describedby":
              [hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
                .filter(Boolean)
                .join(" ") || undefined,
            "aria-invalid": !!error,
          })
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {error && (
        <small id={`${id}-error`} className="error">
          {error}
        </small>
      )}
    </div>
  );
}
export function Badge({
  children,
  status = "",
}: {
  children?: ReactNode;
  status?: string;
}) {
  return (
    <span
      className={cn(
        "badge",
        ["pass", "approved", "available", "synced", "completed"].includes(
          status,
        ) && "badge-green",
        ["hold", "submitted", "pending", "qc", "experimental"].includes(
          status,
        ) && "badge-amber",
        ["reject", "reversed", "conflict", "failed"].includes(status) &&
          "badge-red",
      )}
    >
      {children || humanize(status)}
    </span>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={26} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading({
  label = "Loading your workspace…",
}: {
  label?: string;
}) {
  return (
    <div className="empty">
      <LoaderCircle className="spin" size={28} />
      <p>{label}</p>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  );
}
