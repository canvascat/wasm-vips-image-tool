export type CropOp = {
  kind: "crop";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RotateOp = {
  kind: "rotate";
  angle: number;
  expand: boolean;
};

export type FlipOp = {
  kind: "flip";
  axis: "horizontal" | "vertical";
};

export type WatermarkOp = {
  kind: "watermark";
  rgba: ArrayBuffer;
  layerWidth: number;
  layerHeight: number;
  widthRatio: number;
  xRatio: number;
  yRatio: number;
};

export type ImageOp = CropOp | RotateOp | FlipOp | WatermarkOp;

export type ExportFormat = "jpeg" | "png" | "webp";

export type WorkerRequest =
  | { id: number; type: "load"; buffer: ArrayBuffer }
  | { id: number; type: "preview"; ops: ImageOp[]; maxSize: number }
  | {
      id: number;
      type: "export";
      ops: ImageOp[];
      format: ExportFormat;
      quality: number;
    };

export type ImageInfo = {
  width: number;
  height: number;
  format: string;
};

export type WorkerResponse =
  | { id: number; type: "ready" }
  | { id: number; type: "loaded"; info: ImageInfo }
  | {
      id: number;
      type: "result";
      kind: "preview" | "export";
      buffer: ArrayBuffer;
      width: number;
      height: number;
    }
  | { id: number; type: "error"; message: string };
