"use client";

import {
  BlockNoteSchema,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from "@blocknote/core";
import { createReactInlineContentSpec } from "@blocknote/react";
import { taskBodyBlockSpecs } from "@/lib/blocknote-youtube";

export const userMentionInline = createReactInlineContentSpec(
  {
    type: "userMention" as const,
    propSchema: {
      userId: { default: "" as const },
      label: { default: "" as const },
    },
    content: "none",
  },
  {
    render: (props) => {
      const label = String(props.inlineContent.props.label ?? "").trim() || "동료";
      return (
        <span
          ref={props.contentRef}
          className="rounded bg-violet-500/15 px-0.5 font-medium text-violet-700 dark:text-violet-300"
          data-user-mention="true"
        >
          @{label}
        </span>
      );
    },
    toExternalHTML: (props) => {
      const label = String(props.inlineContent.props.label ?? "").trim() || "";
      return <span>@{label}</span>;
    },
  }
);

export const taskBodySchema = BlockNoteSchema.create({
  blockSpecs: taskBodyBlockSpecs,
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    userMention: userMentionInline,
  },
  styleSpecs: defaultStyleSpecs,
});
