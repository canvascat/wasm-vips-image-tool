import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ExportFormat,
  ImageInfo,
  ImageOp,
  WorkerRequest,
  WorkerResponse,
} from "@/core/messages";

type Pending = {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
};

type PreviewState = {
  url: string;
  width: number;
  height: number;
};

const isolationReady = () =>
  typeof window !== "undefined" && "crossOriginIsolated" in window && window.crossOriginIsolated;

export function useImageEngine() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, Pending>());
  const idRef = useRef(0);
  const latestPreviewRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<ImageInfo | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pending = pendingRef.current;
    const previewUrl = previewUrlRef;
    const worker = new Worker(new URL("../worker/image.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.id === 0 && message.type === "ready") {
        setReady(true);
        return;
      }
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.type === "error") entry.reject(new Error(message.message));
      else entry.resolve(message);
    };
    worker.onerror = (event) => {
      setError(event.message || "图像处理线程启动失败");
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
      for (const entry of pending.values()) {
        entry.reject(new Error("图像处理线程已关闭"));
      }
      pending.clear();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  const send = useCallback(
    <T extends WorkerResponse>(message: WorkerRequest, transfer?: Transferable[]) =>
      new Promise<T>((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          reject(new Error("图像处理线程尚未就绪"));
          return;
        }
        pendingRef.current.set(message.id, {
          resolve: (response) => resolve(response as T),
          reject,
        });
        worker.postMessage(message, transfer ?? []);
      }),
    [],
  );

  const nextId = useCallback(() => ++idRef.current, []);

  const loadFile = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        const buffer = await file.arrayBuffer();
        const response = await send<Extract<WorkerResponse, { type: "loaded" }>>(
          { id: nextId(), type: "load", buffer },
          [buffer],
        );
        setInfo(response.info);
        return response.info;
      } finally {
        setBusy(false);
      }
    },
    [nextId, send],
  );

  const renderPreview = useCallback(
    async (ops: ImageOp[], maxSize = 1600) => {
      if (!info) return;
      const id = nextId();
      latestPreviewRef.current = id;
      try {
        const response = await send<Extract<WorkerResponse, { type: "result" }>>({
          id,
          type: "preview",
          ops,
          maxSize,
        });
        if (id !== latestPreviewRef.current) return;
        const url = URL.createObjectURL(new Blob([response.buffer], { type: "image/png" }));
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setPreview({ url, width: response.width, height: response.height });
      } catch (cause) {
        if (id === latestPreviewRef.current) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    },
    [info, nextId, send],
  );

  const exportImage = useCallback(
    async (ops: ImageOp[], format: ExportFormat, quality: number) => {
      setBusy(true);
      setError(null);
      try {
        const response = await send<Extract<WorkerResponse, { type: "result" }>>({
          id: nextId(),
          type: "export",
          ops,
          format,
          quality,
        });
        const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
        return new Blob([response.buffer], { type: mime });
      } finally {
        setBusy(false);
      }
    },
    [nextId, send],
  );

  return {
    ready,
    isolated: isolationReady(),
    info,
    preview,
    busy,
    error,
    setError,
    loadFile,
    renderPreview,
    exportImage,
  };
}
