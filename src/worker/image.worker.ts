/// <reference lib="webworker" />
import type { ImageOp, ImageInfo, WorkerRequest, WorkerResponse } from "@/core/messages";

type VipsImage = {
  width: number;
  height: number;
  format?: string;
  thumbnailImage: (width: number, options?: object) => VipsImage;
  extractArea: (x: number, y: number, width: number, height: number) => VipsImage;
  flipHor: () => VipsImage;
  flipVer: () => VipsImage;
  rot90: () => VipsImage;
  rot180: () => VipsImage;
  rot270: () => VipsImage;
  rotate: (angle: number) => VipsImage;
  embed: (x: number, y: number, width: number, height: number, options?: object) => VipsImage;
  resize: (scale: number) => VipsImage;
  premultiply: () => VipsImage;
  composite2: (overlay: VipsImage, mode: string, options?: object) => VipsImage;
  hasAlpha: () => boolean;
  flatten: (options?: object) => VipsImage;
  writeToBuffer: (format: string, options?: object) => Uint8Array;
  isDeleted: () => boolean;
  delete: () => void;
};

type VipsInstance = {
  Image: {
    newFromBuffer: (data: Uint8Array) => VipsImage;
    newFromMemory: (
      data: Uint8Array,
      width: number,
      height: number,
      bands: number,
      format: number,
    ) => VipsImage;
  };
  BandFormat: { uchar: number };
  concurrency: (count: number) => void;
};

type VipsFactory = (config: {
  locateFile: (url: string) => string;
  print: (message: string) => void;
  printErr: (message: string) => void;
}) => Promise<VipsInstance>;

let vipsPromise: Promise<VipsInstance> | null = null;
let original: VipsImage | null = null;
let work: VipsImage | null = null;

const post = (message: WorkerResponse, transfer?: Transferable[]) => {
  self.postMessage(message, transfer ?? []);
};

const loadVipsFactory = async () => {
  const base = import.meta.env.BASE_URL;
  const module = await import(/* @vite-ignore */ `${base}vips/vips-es6.js`);
  return module.default as VipsFactory;
};

const getVips = () => {
  if (!vipsPromise) {
    const base = import.meta.env.BASE_URL;
    vipsPromise = loadVipsFactory()
      .then((Vips) =>
        Vips({
          locateFile: (url) => `${base}vips/${url}`,
          print: () => {},
          printErr: console.error,
        }),
      )
      .then((instance) => {
        instance.concurrency(Math.min(4, navigator.hardwareConcurrency || 2));
        post({ id: 0, type: "ready" });
        return instance;
      });
  }
  return vipsPromise;
};

const toArrayBuffer = (data: Uint8Array) =>
  data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

const applyOps = (vips: VipsInstance, source: VipsImage, ops: ImageOp[]) => {
  const created: VipsImage[] = [];
  let current = source;
  const replace = (next: VipsImage) => {
    created.push(next);
    current = next;
  };

  for (const op of ops) {
    if (op.kind === "crop") {
      replace(
        current.extractArea(
          Math.max(0, Math.round(op.x)),
          Math.max(0, Math.round(op.y)),
          Math.max(1, Math.round(op.width)),
          Math.max(1, Math.round(op.height)),
        ),
      );
      continue;
    }

    if (op.kind === "flip") {
      replace(op.axis === "horizontal" ? current.flipHor() : current.flipVer());
      continue;
    }

    if (op.kind === "rotate") {
      const angle = ((op.angle % 360) + 360) % 360;
      if (!op.expand && angle % 90 === 0) {
        if (angle === 90) replace(current.rot90());
        else if (angle === 180) replace(current.rot180());
        else if (angle === 270) replace(current.rot270());
        continue;
      }
      const radians = (angle * Math.PI) / 180;
      const width =
        Math.abs(current.width * Math.cos(radians)) + Math.abs(current.height * Math.sin(radians));
      const height =
        Math.abs(current.width * Math.sin(radians)) + Math.abs(current.height * Math.cos(radians));
      const targetWidth = Math.ceil(width);
      const targetHeight = Math.ceil(height);
      const padded = current.embed(
        Math.floor((targetWidth - current.width) / 2),
        Math.floor((targetHeight - current.height) / 2),
        targetWidth,
        targetHeight,
        { extend: "background", background: 255 },
      );
      created.push(padded);
      replace(padded.rotate(angle));
      continue;
    }

    const layer = vips.Image.newFromMemory(
      new Uint8Array(op.rgba),
      op.layerWidth,
      op.layerHeight,
      4,
      vips.BandFormat.uchar,
    );
    created.push(layer);
    const targetWidth = Math.max(1, Math.round(current.width * op.widthRatio));
    const targetHeight = Math.max(1, Math.round((op.layerHeight * targetWidth) / op.layerWidth));
    const scale = targetWidth / op.layerWidth;
    const scaled = scale === 1 ? layer : layer.resize(scale);
    if (scaled !== layer) created.push(scaled);
    const premultiplied = scaled.premultiply();
    created.push(premultiplied);
    const x = Math.round(current.width * op.xRatio - targetWidth / 2);
    const y = Math.round(current.height * op.yRatio - targetHeight / 2);
    replace(current.composite2(premultiplied, "over", { x, y, premultiplied: true }));
  }

  return { image: current, created };
};

const cleanup = (images: VipsImage[]) => {
  for (const image of images) {
    if (!image.isDeleted()) image.delete();
  }
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const vips = await getVips();

    if (request.type === "load") {
      if (original && !original.isDeleted()) original.delete();
      if (work && !work.isDeleted()) work.delete();
      original = vips.Image.newFromBuffer(new Uint8Array(request.buffer));
      work = original.thumbnailImage(1600, { size: "down" });
      const info: ImageInfo = {
        width: original.width,
        height: original.height,
        format: String(original.format ?? ""),
      };
      post({ id: request.id, type: "loaded", info });
      return;
    }

    if (!original || !work) {
      throw new Error("请先加载图片");
    }

    if (request.type === "preview") {
      const { image, created } = applyOps(vips, work, request.ops);
      try {
        const output = image.writeToBuffer(".png");
        const buffer = toArrayBuffer(output);
        post(
          {
            id: request.id,
            type: "result",
            kind: "preview",
            buffer,
            width: image.width,
            height: image.height,
          },
          [buffer],
        );
      } finally {
        cleanup(created);
      }
      return;
    }

    const { image, created } = applyOps(vips, original, request.ops);
    try {
      let outputImage = image;
      const extras: VipsImage[] = [];
      if (request.format === "jpeg" && image.hasAlpha()) {
        outputImage = image.flatten({ background: [255, 255, 255] });
        extras.push(outputImage);
      }
      try {
        const extension = request.format === "jpeg" ? ".jpg" : `.${request.format}`;
        const options =
          request.format === "png"
            ? { compression: 6 }
            : { Q: request.quality, optimize_coding: true, interlace: true };
        const output = outputImage.writeToBuffer(extension, options);
        const buffer = toArrayBuffer(output);
        post(
          {
            id: request.id,
            type: "result",
            kind: "export",
            buffer,
            width: outputImage.width,
            height: outputImage.height,
          },
          [buffer],
        );
      } finally {
        cleanup(extras);
      }
    } finally {
      cleanup(created);
    }
  } catch (error) {
    post({
      id: request.id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
