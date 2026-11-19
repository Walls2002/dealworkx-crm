"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Baseline, Bold, ChevronDown, Italic, Link2, List, ListOrdered, Redo2, RemoveFormatting,
  Type, Underline, Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Gmail's font choices, as email-safe stacks. */
const FONTS = [
  { label: "Sans Serif", value: "Arial, Helvetica, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Fixed width", value: "'Courier New', Courier, monospace" },
  { label: "Wide", value: "'Arial Black', Arial, sans-serif" },
  { label: "Narrow", value: "'Arial Narrow', Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
];
/** execCommand sizes 1–7; Gmail offers four of them. */
const SIZES = [
  { label: "Small", value: "2", className: "text-xs" },
  { label: "Normal", value: "3", className: "text-sm" },
  { label: "Large", value: "5", className: "text-lg" },
  { label: "Huge", value: "6", className: "text-2xl" },
];
const COLORS = [
  "#000000", "#444444", "#666666", "#999999", "#cccccc", "#ffffff",
  "#c0392b", "#e67e22", "#f1c40f", "#27ae60", "#0f5a48", "#2980b9",
  "#1a4f8b", "#8e44ad", "#d35400", "#7f8c8d", "#16a085", "#2c3e50",
];

type Toggle = "bold" | "italic" | "underline" | "insertOrderedList" | "insertUnorderedList" | "justifyLeft" | "justifyCenter" | "justifyRight";

/**
 * A formatted message body, like Gmail's: type in the box, format from the bar below it.
 * The HTML and a plain-text copy are kept in two hidden inputs (htmlName, textName) for the form to submit;
 * the server cleans the HTML before it is sent.
 */
export function RichEditor({ initialHtml, htmlName, textName, labelId, disabled = false }: {
  initialHtml: string; htmlName: string; textName: string; labelId: string; disabled?: boolean;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const htmlInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const saved = useRef<Range | null>(null);
  const [active, setActive] = useState<Set<Toggle>>(new Set());
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState("");

  const sync = useCallback(() => {
    const el = editor.current;
    if (!el) return;
    if (htmlInput.current) htmlInput.current.value = el.innerHTML;
    if (textInput.current) textInput.current.value = el.innerText.replace(/ /g, " ").trim();
  }, []);

  // Fill once; after that the browser owns the content (re-rendering it would reset the caret).
  useEffect(() => {
    if (editor.current) editor.current.innerHTML = initialHtml;
    sync();
  }, [initialHtml, sync]);

  // Remember the selection inside the box, so toolbar menus (which take focus) still format the right text.
  useEffect(() => {
    const onChange = () => {
      const sel = document.getSelection();
      if (!sel?.rangeCount || !editor.current) return;
      const range = sel.getRangeAt(0);
      if (!editor.current.contains(range.commonAncestorContainer)) return;
      saved.current = range.cloneRange();
      const on = new Set<Toggle>();
      for (const c of ["bold", "italic", "underline", "insertOrderedList", "insertUnorderedList", "justifyCenter", "justifyRight"] as Toggle[]) {
        try { if (document.queryCommandState(c)) on.add(c); } catch { /* unsupported */ }
      }
      setActive(on);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  const restore = () => {
    const el = editor.current;
    if (!el) return;
    el.focus();
    const sel = document.getSelection();
    if (saved.current && sel) {
      sel.removeAllRanges();
      sel.addRange(saved.current);
    }
  };

  const run = (command: string, value?: string) => {
    restore();
    // Inline styles (not <font> tags) for colours and fonts: they survive more mail clients.
    document.execCommand("styleWithCSS", false, command === "fontSize" ? "false" : "true");
    document.execCommand(command, false, value);
    sync();
  };

  const applyLink = () => {
    const href = url.trim();
    if (!href) return setLinking(false);
    const full = /^(https?:|mailto:|tel:)/i.test(href) ? href : `https://${href}`;
    restore();
    const sel = document.getSelection();
    if (sel && sel.isCollapsed) {
      const a = document.createElement("a");
      a.href = full;
      a.textContent = href;
      saved.current?.insertNode(a);
    } else {
      document.execCommand("createLink", false, full);
    }
    setLinking(false);
    setUrl("");
    sync();
  };

  // Keep the selection when a plain toolbar button is pressed.
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const tool = (label: string, icon: React.ReactNode, onClick: () => void, on = false) => (
    <Button
      type="button" variant="ghost" size="icon-sm" title={label} aria-label={label} aria-pressed={on || undefined}
      onMouseDown={keep} onClick={onClick} disabled={disabled}
      className={cn("size-8 shrink-0 rounded-full text-foreground/80 hover:bg-background", on && "bg-background text-foreground shadow-xs ring-1 ring-border")}
    >
      {icon}
    </Button>
  );
  const menuTrigger = (label: string, children: React.ReactNode) => (
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="sm" title={label} aria-label={label} disabled={disabled}
        className="h-8 shrink-0 gap-1 rounded-full px-2 text-foreground/80 hover:bg-background">
        {children}<ChevronDown className="size-3 opacity-60" />
      </Button>
    </DropdownMenuTrigger>
  );
  const divider = <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />;
  const noRefocus = (e: Event) => e.preventDefault();

  return (
    <div className="grid gap-2">
      <input ref={htmlInput} type="hidden" name={htmlName} />
      <input ref={textInput} type="hidden" name={textName} />
      <div
        ref={editor}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelId}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
        className={cn(
          "max-h-[26rem] min-h-56 overflow-auto rounded-lg border bg-background px-3.5 py-3 text-sm leading-relaxed text-[#222] caret-primary outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 selection:bg-primary/20",
          "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_blockquote]:border-l [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        )}
      />

      {linking && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <Input
            autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste or type a link, e.g. dealworkx.com"
            aria-label="Link address" className="h-8 min-w-56 flex-1 bg-background"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") setLinking(false); }}
          />
          <Button type="button" size="sm" onClick={applyLink}>Add link</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setLinking(false)}>Cancel</Button>
        </div>
      )}

      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 rounded-2xl bg-muted/70 px-1.5 py-1">
        {tool("Undo (Ctrl+Z)", <Undo2 />, () => run("undo"))}
        {tool("Redo (Ctrl+Y)", <Redo2 />, () => run("redo"))}
        {divider}
        <DropdownMenu>
          {menuTrigger("Font", <span className="text-[13px]">Sans Serif</span>)}
          <DropdownMenuContent align="start" onCloseAutoFocus={noRefocus}>
            {FONTS.map((f) => (
              <DropdownMenuItem key={f.label} onSelect={() => run("fontName", f.value)} style={{ fontFamily: f.value }}>{f.label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {divider}
        <DropdownMenu>
          {menuTrigger("Size", <Type />)}
          <DropdownMenuContent align="start" onCloseAutoFocus={noRefocus}>
            {SIZES.map((s) => (
              <DropdownMenuItem key={s.value} onSelect={() => run("fontSize", s.value)} className={s.className}>{s.label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {divider}
        {tool("Bold (Ctrl+B)", <Bold />, () => run("bold"), active.has("bold"))}
        {tool("Italic (Ctrl+I)", <Italic />, () => run("italic"), active.has("italic"))}
        {tool("Underline (Ctrl+U)", <Underline />, () => run("underline"), active.has("underline"))}
        <DropdownMenu>
          {menuTrigger("Text colour", <Baseline />)}
          <DropdownMenuContent align="start" className="w-auto p-2" onCloseAutoFocus={noRefocus}>
            <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Text colours">
              {COLORS.map((c) => (
                <DropdownMenuItem key={c} onSelect={() => run("foreColor", c)} aria-label={`Colour ${c}`} title={c}
                  className="size-6 rounded-full p-0 ring-1 ring-black/10 focus:ring-2 focus:ring-ring" style={{ backgroundColor: c }} />
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        {divider}
        <DropdownMenu>
          {menuTrigger("Align", active.has("justifyCenter") ? <AlignCenter /> : active.has("justifyRight") ? <AlignRight /> : <AlignLeft />)}
          <DropdownMenuContent align="start" onCloseAutoFocus={noRefocus}>
            <DropdownMenuItem onSelect={() => run("justifyLeft")}><AlignLeft /> Left</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => run("justifyCenter")}><AlignCenter /> Centre</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => run("justifyRight")}><AlignRight /> Right</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {tool("Numbered list", <ListOrdered />, () => run("insertOrderedList"), active.has("insertOrderedList"))}
        {tool("Bulleted list", <List />, () => run("insertUnorderedList"), active.has("insertUnorderedList"))}
        {divider}
        {tool("Insert link", <Link2 />, () => setLinking(true))}
        {tool("Remove formatting", <RemoveFormatting />, () => { run("removeFormat"); run("unlink"); })}
      </div>
    </div>
  );
}

/** Plain text (a step template) as editor HTML: paragraphs and line breaks kept. */
export function textToEditorHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 1em">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
