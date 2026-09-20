"use client";

/**
 * The actual MDXEditor instance, split into its own module so it can be loaded
 * client-side only (see markdown-editor.tsx). MDXEditor uses browser-only APIs
 * and top-level `await`, so it must never render on the server.
 *
 * This is the visual ("what you see is what you get") editor used for the
 * agenda body during a meeting — leaders edit rendered markdown directly
 * instead of typing raw syntax, with a toolbar for the common blocks and a
 * source toggle for when raw markdown is easier.
 */

import type { ForwardedRef } from "react";
import {
  MDXEditor,
  type MDXEditorMethods,
  type MDXEditorProps,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  tablePlugin,
  linkPlugin,
  linkDialogPlugin,
  markdownShortcutPlugin,
  diffSourcePlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  CreateLink,
  InsertTable,
  InsertThematicBreak,
  Separator,
  DiffSourceToggleWrapper,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

export default function InitializedMDXEditor({
  editorRef,
  compact = false,
  ...props
}: {
  editorRef: ForwardedRef<MDXEditorMethods>;
  /** A lighter toolbar for smaller panes (e.g. the notes pane). */
  compact?: boolean;
} & MDXEditorProps) {
  return (
    <MDXEditor
      ref={editorRef}
      contentEditableClassName="mdx-agenda-prose"
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        tablePlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        markdownShortcutPlugin(),
        diffSourcePlugin({ viewMode: "rich-text" }),
        toolbarPlugin({
          toolbarContents: () =>
            compact ? (
              <DiffSourceToggleWrapper>
                <BoldItalicUnderlineToggles />
                <Separator />
                <BlockTypeSelect />
                <Separator />
                <ListsToggle />
                <CreateLink />
              </DiffSourceToggleWrapper>
            ) : (
              <DiffSourceToggleWrapper>
                <UndoRedo />
                <Separator />
                <BoldItalicUnderlineToggles />
                <Separator />
                <BlockTypeSelect />
                <Separator />
                <ListsToggle />
                <Separator />
                <CreateLink />
                <InsertTable />
                <InsertThematicBreak />
              </DiffSourceToggleWrapper>
            ),
        }),
      ]}
      {...props}
    />
  );
}
