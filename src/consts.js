export const SPECIAL_OBJ_PROPERTIES = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

export const FIRST_LATEX_REGEX = /\$\$([\s\S]+?)\$\$/g;
export const SECOND_LATEX_REGEX = /(?<!\\)\$([^\n$]+?)\$/g;
export const CODE_BLOCK_REGEX = /^\s*```(\w*)\n([\s\S]*?)\n\s*```/gm;
export const NAME_REPLACE_URL = /[^a-z0-9]/gi;
export const PROCCESS_MARKDOWN_REGEX = /!\[(.*?)\]\((.*?)\)/g;
export const MARKDOWN_H6_REGEX = /^###### (.*$)/gim;
export const MARKDOWN_H5_REGEX = /^##### (.*$)/gim;
export const MARKDOWN_H4_REGEX = /^#### (.*$)/gim;
export const MARKDOWN_H3_REGEX = /^### (.*$)/gim;
export const MARKDOWN_H2_REGEX = /^## (.*$)/gim;
export const MARKDOWN_H1_REGEX = /^# (.*$)/gim;
export const MARKDOWN_BOLD_REGEX = /\*\*(.*?)\*\*/g;
export const MARKDOWN_ITALIC_REGEX = /\*(.*?)\*/g;
// export const MARKDOWN_CODE_REGEX = /`(.+?)`/g;
export const MARKDOWN_HR_REGEX = /^\s*---+\s*$/gm;
export const MARKDOWN_CODE_REGEX = /`(.*?)`/g;
export const MARKDOWN_BREACK_REGEX = /\n/g;
export const MARKDOWN_TITLE_SPACE_LINE_1 = /(<\/h[1-6]>|<hr>)(<br>\s*)+/gi;
export const MARKDOWN_TITLE_SPACE_LINE_2 = /(<br>\s*)+(<h[1-6]|<hr>)/gi;
export const SESSIONS_TITLE = /\/X\/(.*?)\/X\//;
export const ESCAPE_SPECIAL_CHARACTERS_REGEX = /[&<>"']/g;

