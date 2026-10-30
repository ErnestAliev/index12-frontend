import MarkdownIt from 'markdown-it';

// Model output is untrusted: raw HTML and remotely loaded media stay disabled.
const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false, typographer: false });
const validateLink = markdown.validateLink.bind(markdown);
markdown.validateLink = url => /^(https?:|mailto:|#|\/(?!\/))/i.test(url) && validateLink(url);
const defaultLink = markdown.renderer.rules.link_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('target', '_blank');
  tokens[index].attrSet('rel', 'noopener noreferrer');
  return defaultLink(tokens, index, options, env, self);
};
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content || 'Изображение');
markdown.renderer.rules.table_open = () => '<div class="codex-table-scroll" role="region" aria-label="Таблица" tabindex="0"><table>';
markdown.renderer.rules.table_close = () => '</table></div>\n';
export const renderCodexMarkdown = text => markdown.render(typeof text === 'string' ? text : '');
