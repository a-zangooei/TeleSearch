import React from 'react';

const INLINE_URL_SPLIT_RE = /(https?:\/\/[^\s<>()"'«»]+)/gi;

/**
 * Renders Persian/mixed prose while isolating embedded LTR URLs in `<bdi dir="ltr">`
 * so trailing slashes and punctuation never flip in RTL paragraphs.
 */
export const BdiProseText: React.FC<{ text: string; className?: string }> = ({
  text,
  className,
}) => {
  const parts = text.split(INLINE_URL_SPLIT_RE);
  return (
    <span className={className}>
      {parts.map((part, idx) =>
        /^https?:\/\//i.test(part) ? (
          <bdi key={idx} dir="ltr" className="font-mono text-[13px] text-sky-800 break-all">
            {part}
          </bdi>
        ) : (
          <React.Fragment key={idx}>{part}</React.Fragment>
        )
      )}
    </span>
  );
};
