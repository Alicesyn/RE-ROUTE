import React, { useState } from "react";

export interface ExpandableDescriptionProps {
  text: any;
}

export const ExpandableDescription: React.FC<ExpandableDescriptionProps> = ({ text }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const rawText =
    typeof text === "string"
      ? text
      : text && typeof text === "object" && "text" in text
        ? String(text.text)
        : text && typeof text === "object"
          ? JSON.stringify(text)
          : String(text || "");

  if (!rawText.trim()) return null;

  const shouldTruncate = rawText.length > 100;

  return (
    <div className="relative">
      <p
        className={`text-xs text-surface-500 dark:text-surface-400 leading-relaxed ${!isExpanded && shouldTruncate ? "line-clamp-2" : ""}`}
      >
        {rawText}
      </p>
      {shouldTruncate && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="text-[10px] font-bold text-primary-600 dark:text-primary-400 hover:underline mt-1"
        >
          {isExpanded ? "Show Less" : "Show More"}
        </button>
      )}
    </div>
  );
};
