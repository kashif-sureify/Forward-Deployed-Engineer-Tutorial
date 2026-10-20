const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_IMAGE_PROMPT = 'Describe this image.';

const chat = document.getElementById('chat');
const messages = document.getElementById('messages');
const emptyState = document.getElementById('empty-state');
const form = document.getElementById('composer');
const input = document.getElementById('message');
const sendButton = document.getElementById('send');
const imageInput = document.getElementById('image-input');
const preview = document.getElementById('preview');
const previewImage = document.getElementById('preview-image');
const removeImageButton = document.getElementById('remove-image');
const clearChatButton = document.getElementById('clear-chat');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightbox-image');

let selectedImage = null;
let busy = false;

// ---------- Rendering ----------

function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

function addMessage(role, text, imageUrl) {
  emptyState.hidden = true;
  const row = document.createElement('div');
  row.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Uploaded image';
    bubble.appendChild(img);
  }
  if (role === 'assistant') {
    renderMarkdown(bubble, text);
  } else if (text) {
    bubble.appendChild(document.createTextNode(text));
  }

  row.appendChild(bubble);
  messages.appendChild(row);
  scrollToBottom();
  return row;
}

function addTypingIndicator() {
  emptyState.hidden = true;
  const row = document.createElement('div');
  row.className = 'message assistant';
  row.innerHTML = '<div class="bubble"><span class="typing"><span></span><span></span><span></span></span></div>';
  messages.appendChild(row);
  scrollToBottom();
  return row;
}

// Minimal, safe markdown: fenced code blocks, inline code and bold. Everything is
// inserted as text nodes, so model output can never inject HTML.
function renderMarkdown(container, text) {
  const segments = text.split(/```(?:[\w-]*)\n?([\s\S]*?)```/g);
  segments.forEach((segment, index) => {
    if (index % 2 === 1) {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = segment.replace(/\n$/, '');
      pre.appendChild(code);
      container.appendChild(pre);
      return;
    }
    segment.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).forEach((part) => {
      if (!part) return;
      if (part.startsWith('`') && part.endsWith('`')) {
        const code = document.createElement('code');
        code.textContent = part.slice(1, -1);
        container.appendChild(code);
      } else if (part.startsWith('**') && part.endsWith('**')) {
        const strong = document.createElement('strong');
        strong.textContent = part.slice(2, -2);
        container.appendChild(strong);
      } else {
        container.appendChild(document.createTextNode(part));
      }
    });
  });
}

// ---------- Composer state ----------

function updateSendButton() {
  sendButton.disabled = busy || (!input.value.trim() && !selectedImage);
  clearChatButton.disabled = busy || messages.childElementCount === 0;
}

function autoResize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
}

function setImage(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    addMessage('error', 'Please choose an image file.');
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    addMessage('error', 'Maximum image size is 10 MB.');
    return;
  }
  clearImage();
  selectedImage = file;
  previewImage.src = URL.createObjectURL(file);
  preview.hidden = false;
  updateSendButton();
}

function clearImage() {
  if (previewImage.src) URL.revokeObjectURL(previewImage.src);
  previewImage.removeAttribute('src');
  selectedImage = null;
  imageInput.value = '';
  preview.hidden = true;
  updateSendButton();
}

// ---------- API calls ----------

async function sendMessage() {
  const text = input.value.trim();
  if (busy || (!text && !selectedImage)) return;

  const image = selectedImage;
  // Keep a separate object URL for the chat history; the preview's URL is revoked below.
  const imageUrl = image ? URL.createObjectURL(image) : null;
  addMessage('user', text, imageUrl);

  const body = new FormData();
  body.append('message', text || DEFAULT_IMAGE_PROMPT);
  if (image) body.append('image', image);

  input.value = '';
  autoResize();
  clearImage();
  busy = true;
  updateSendButton();
  const typing = addTypingIndicator();

  let reply = '';
  try {
    const response = await fetch('/api/chat', { method: 'POST', body });
    if (!response.ok) {
      const errorText = await response.text();
      typing.remove();
      addMessage('error', errorText || `Request failed (${response.status}).`);
      return;
    }

    // Read the reply as it streams in, re-rendering the bubble after each chunk.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bubble = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      reply += decoder.decode(value, { stream: true });
      if (!bubble) {
        typing.remove();
        bubble = addMessage('assistant', '').querySelector('.bubble');
      }
      // Only auto-scroll if the user hasn't scrolled up to read earlier messages.
      const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
      bubble.replaceChildren();
      renderMarkdown(bubble, reply);
      if (nearBottom) scrollToBottom();
    }
    reply += decoder.decode();
    if (!bubble) {
      typing.remove();
      addMessage('assistant', reply || '(No response)');
    }
  } catch {
    typing.remove();
    addMessage('error', reply
      ? 'The response was interrupted before it finished.'
      : 'Could not reach the server. Is it running?');
  } finally {
    busy = false;
    updateSendButton();
    input.focus();
  }
}

// Clears the server-side history, then the on-screen conversation.
async function clearChat() {
  if (busy || messages.childElementCount === 0) return;
  if (!confirm('Clear this conversation? The model will forget everything said so far.')) return;
  try {
    const response = await fetch('/api/chat', { method: 'DELETE' });
    if (!response.ok) throw new Error();
    messages.replaceChildren();
    emptyState.hidden = false;
    clearImage();
    input.value = '';
    autoResize();
    input.focus();
  } catch {
    addMessage('error', 'Could not clear the conversation.');
  } finally {
    updateSendButton();
  }
}

// ---------- Image lightbox ----------

function openLightbox(src) {
  lightboxImage.src = src;
  lightbox.showModal();
}

// Delegated so it also works for images in messages added later.
messages.addEventListener('click', (event) => {
  if (event.target.matches('.bubble img')) openLightbox(event.target.src);
});
previewImage.addEventListener('click', () => openLightbox(previewImage.src));

// Clicking anywhere (image, backdrop or ×) closes it; Esc is handled by <dialog>.
lightbox.addEventListener('click', () => lightbox.close());
lightbox.addEventListener('close', () => {
  lightboxImage.removeAttribute('src');
  input.focus();
});

// ---------- Events ----------

form.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage();
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendMessage();
  }
});

input.addEventListener('input', () => {
  autoResize();
  updateSendButton();
});

input.addEventListener('paste', (event) => {
  const file = [...event.clipboardData.files].find((f) => f.type.startsWith('image/'));
  if (file) {
    event.preventDefault();
    setImage(file);
  }
});

imageInput.addEventListener('change', () => setImage(imageInput.files[0]));
removeImageButton.addEventListener('click', clearImage);
clearChatButton.addEventListener('click', clearChat);

form.addEventListener('dragover', (event) => {
  event.preventDefault();
  form.classList.add('dragging');
});
form.addEventListener('dragleave', () => form.classList.remove('dragging'));
form.addEventListener('drop', (event) => {
  event.preventDefault();
  form.classList.remove('dragging');
  setImage(event.dataTransfer.files[0]);
});

input.focus();
