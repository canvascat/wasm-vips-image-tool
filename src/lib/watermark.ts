export type WatermarkSettings = {
  mode: "text" | "image";
  text: string;
  imageSrc: string | null;
  fontSize: number;
  color: string;
  opacity: number;
  widthRatio: number;
  xRatio: number;
  yRatio: number;
};

export type WatermarkLayer = {
  rgba: ArrayBuffer;
  width: number;
  height: number;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("水印图片加载失败"));
    image.src = src;
  });

export async function renderWatermarkLayer(settings: WatermarkSettings): Promise<WatermarkLayer> {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持 Canvas 2D");

  if (settings.mode === "image") {
    if (!settings.imageSrc) throw new Error("请先选择水印图片");
    const image = await loadImage(settings.imageSrc);
    canvas.width = 512;
    canvas.height = Math.max(1, Math.round((512 * image.height) / image.width));
    context.globalAlpha = settings.opacity;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } else {
    const font = `600 ${settings.fontSize}px "Geist Variable", system-ui, sans-serif`;
    context.font = font;
    const measured = context.measureText(settings.text || "水印").width;
    canvas.width = Math.min(1600, Math.max(64, Math.ceil(measured + 32)));
    canvas.height = Math.ceil(settings.fontSize * 1.6);
    context.font = font;
    context.globalAlpha = settings.opacity;
    context.fillStyle = settings.color;
    context.textBaseline = "middle";
    context.fillText(settings.text || "水印", 16, canvas.height / 2);
  }

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return {
    rgba: pixels.data.buffer as ArrayBuffer,
    width: canvas.width,
    height: canvas.height,
  };
}
