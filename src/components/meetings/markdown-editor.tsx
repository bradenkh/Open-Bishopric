"use client";

/**
 * Client-only wrapper around MDXEditor. `next/dynamic` with `ssr: false` keeps
 * the (browser-only) editor out of the server bundle; the ref is threaded
 * through as an `editorRef` prop because a dynamically-imported component can't
 * take a real `ref`. See initialized-mdx-editor.tsx for the editor itself.
 */

import dynamic from "next/dynamic";
import { forwardRef } from "react";
import type { MDXEditorMethods, MDXEditorProps } from "@mdxeditor/editor";

const Editor = dynamic(() => import("./initialized-mdx-editor"), {
  ssr: false,
  loading: () => (
    <div className="p-4 text-sm text-muted-foreground">Loading editor…</div>
  ),
});

export const MarkdownEditor = forwardRef<MDXEditorMethods, MDXEditorProps>(
  function MarkdownEditor(props, ref) {
    return <Editor {...props} editorRef={ref} />;
  },
);
