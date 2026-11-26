// Node has no DOM, so three.js's image loading is given a stand-in: an image element that
// "loads" as soon as its src is set (1 x 1 pixels), and createImageBitmap. Tests check which
// textures were found, not their pixels.

class FakeImage {
  width = 1;
  height = 1;
  private listeners = new Map<string, ((e: unknown) => void)[]>();
  private source = '';
  addEventListener(type: string, fn: (e: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: (e: unknown) => void) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn));
  }
  get src() {
    return this.source;
  }
  set src(value: string) {
    this.source = value;
    const type = value.startsWith('blob:') || value.startsWith('data:') ? 'load' : 'error';
    setTimeout(() => {
      for (const fn of this.listeners.get(type) ?? []) fn({ type, target: this });
    }, 0);
  }
  setAttribute() {}
}

const g = globalThis as Record<string, unknown>;
if (!g.document) {
  g.document = {
    createElementNS: (_ns: string, tag: string) => (tag === 'img' ? new FakeImage() : { getContext: () => null, style: {} }),
    createElement: (tag: string) => (tag === 'img' ? new FakeImage() : { getContext: () => null, style: {} }),
  };
}
if (!g.createImageBitmap) g.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
