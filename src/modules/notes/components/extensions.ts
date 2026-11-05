/**
 * Extensões do editor das Notas:
 *  - NoteImage: imagem do Storage PRIVADO. O documento guarda só o caminho (`path`); a
 *    exibição baixa o arquivo pela sessão do usuário e usa uma URL blob: local.
 *  - VideoLink: cartão de vídeo a partir de um link (TikTok, YouTube, Instagram…). Nada é
 *    enviado nem incorporado de terceiros: o cartão abre o vídeo no site de origem.
 */
import { mergeAttributes, Node } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NoteImageView, VideoLinkView } from './node-views';

export const NoteImage = Image.extend({
  draggable: true,
  addAttributes() {
    return {
      // O caminho no Storage é a única fonte; `src` nunca é salvo (seria uma URL temporária).
      path: { default: null },
      alt: { default: '' },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes({
        'data-path': HTMLAttributes.path as string,
        alt: HTMLAttributes.alt as string,
      }),
    ];
  },
  parseHTML() {
    return [{ tag: 'img[data-path]', getAttrs: (el) => ({ path: el.getAttribute('data-path') }) }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(NoteImageView);
  },
}).configure({ inline: false, allowBase64: false });

export const VideoLink = Node.create({
  name: 'videoLink',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { url: { default: '' } };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-video-url]',
        getAttrs: (el) => ({ url: el.getAttribute('data-video-url') }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-video-url': HTMLAttributes.url as string }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(VideoLinkView);
  },
});
