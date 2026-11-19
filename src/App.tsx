import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ImagePlus, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CropOverlay, type CropBox } from "@/components/CropOverlay";
import type { ExportFormat, ImageOp } from "@/core/messages";
import { useImageEngine } from "@/hooks/useImageEngine";
import { renderWatermarkLayer, type WatermarkSettings } from "@/lib/watermark";

type TabKey = "crop" | "transform" | "watermark" | "export";

const aspectRatios = [
  { label: "自由", value: 0 },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
];

export default function App() {
  const engine = useImageEngine();
  const { renderPreview } = engine;
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabKey>("crop");
  const [ops, setOps] = useState<ImageOp[]>([]);
  const [crop, setCrop] = useState<CropBox>({ x: 0, y: 0, width: 0, height: 0 });
  const [angle, setAngle] = useState(0);
  const [expand, setExpand] = useState(false);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermark, setWatermark] = useState<WatermarkSettings>({
    mode: "text",
    text: "WASM-VIPS",
    imageSrc: null,
    fontSize: 48,
    color: "#ffffff",
    opacity: 0.6,
    widthRatio: 0.3,
    xRatio: 0.5,
    yRatio: 0.5,
  });
  const [format, setFormat] = useState<ExportFormat>("jpeg");
  const [quality, setQuality] = useState(85);
  const [exportSize, setExportSize] = useState<number | null>(null);

  const scale = useMemo(() => {
    if (!engine.info) return 1;
    return Math.min(1, 1600 / Math.max(engine.info.width, engine.info.height));
  }, [engine.info]);

  const watermarkUrlRef = useRef<string | null>(null);

  const onWatermarkFile = (file: File | undefined) => {
    if (watermarkUrlRef.current) URL.revokeObjectURL(watermarkUrlRef.current);
    if (!file) {
      watermarkUrlRef.current = null;
      setWatermark((current) => ({ ...current, imageSrc: null }));
      return;
    }
    const url = URL.createObjectURL(file);
    watermarkUrlRef.current = url;
    setWatermark((current) => ({ ...current, imageSrc: url, mode: "image" }));
  };

  const buildOps = useCallback(
    async (includeCrop: boolean) => {
      const chosen = includeCrop ? ops : ops.filter((op) => op.kind !== "crop");
      const scaled = chosen.map((op) =>
        op.kind === "crop"
          ? {
              ...op,
              x: op.x * scale,
              y: op.y * scale,
              width: op.width * scale,
              height: op.height * scale,
            }
          : op,
      );
      if (!watermarkEnabled) return scaled;
      const layer = await renderWatermarkLayer(watermark);
      return [
        ...scaled,
        {
          kind: "watermark" as const,
          rgba: layer.rgba,
          layerWidth: layer.width,
          layerHeight: layer.height,
          widthRatio: watermark.widthRatio,
          xRatio: watermark.xRatio,
          yRatio: watermark.yRatio,
        },
      ];
    },
    [ops, scale, watermarkEnabled, watermark],
  );

  useEffect(() => {
    if (!engine.ready || !engine.info) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const previewOps = await buildOps(tab !== "crop");
        if (!cancelled) await renderPreview(previewOps, 1600);
      } catch {
        // 水印层尚未就绪时保留上一帧预览
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [engine.ready, engine.info, tab, buildOps, renderPreview]);

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const loaded = await engine.loadFile(file);
      setCrop({ x: 0, y: 0, width: loaded.width, height: loaded.height });
      setOps([]);
      setExportSize(null);
    } catch (cause) {
      engine.setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const applyRatio = (ratio: number) => {
    if (!engine.info || ratio === 0) return;
    const width = crop.width;
    const height = Math.round(width / ratio);
    const maxHeight = engine.info.height - crop.y;
    if (height > maxHeight) return;
    setCrop({ ...crop, height });
  };

  const addRotate = (degrees: number, shouldExpand = expand) => {
    setOps((current) => [...current, { kind: "rotate", angle: degrees, expand: shouldExpand }]);
  };

  const addFlip = (axis: "horizontal" | "vertical") => {
    setOps((current) => [...current, { kind: "flip", axis }]);
  };

  const syncCrop = () => {
    setOps((current) => [...current.filter((op) => op.kind !== "crop"), { kind: "crop", ...crop }]);
  };

  const onExport = async () => {
    if (!engine.info) return;
    try {
      const exportOps = await buildOps(true);
      const blob = await engine.exportImage(exportOps, format, quality);
      setExportSize(blob.size);
      const extension = format === "jpeg" ? "jpg" : format;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `processed.${extension}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      engine.setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const previewBox: CropBox | null =
    tab === "crop" && engine.preview
      ? {
          x: crop.x * scale,
          y: crop.y * scale,
          width: crop.width * scale,
          height: crop.height * scale,
        }
      : null;

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">图片处理工具</h1>
            <p className="text-sm text-muted-foreground">基于 wasm-vips · 所有处理都在本地完成</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setOps([])} disabled={!engine.info}>
              <RotateCcw className="mr-2 h-4 w-4" />
              清空操作
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="mr-2 h-4 w-4" />
              打开图片
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/tiff"
              className="hidden"
              onChange={(event) => onPickFile(event.target.files?.[0])}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {!engine.isolated && (
            <Alert variant="destructive">
              <AlertTitle>当前环境未启用图像处理引擎</AlertTitle>
              <AlertDescription>
                页面需要跨源隔离才能加载 wasm-vips。首次访问会自动刷新一次；若仍提示此信息，请改用
                Chrome/Edge，或换用已配置 COOP/COEP 响应头的 Cloudflare Pages 地址。
              </AlertDescription>
            </Alert>
          )}
          {engine.error && (
            <Alert variant="destructive">
              <AlertTitle>处理失败</AlertTitle>
              <AlertDescription>{engine.error}</AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>预览</CardTitle>
              <CardDescription>
                {engine.info
                  ? `${engine.info.width} × ${engine.info.height} · ${engine.info.format}`
                  : "打开一张图片开始"}
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-[360px]">
              {!engine.preview ? (
                <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                  {engine.ready ? "请打开一张图片" : "正在启动图像处理引擎…"}
                </div>
              ) : previewBox ? (
                <CropOverlay
                  imageUrl={engine.preview.url}
                  width={engine.preview.width}
                  height={engine.preview.height}
                  crop={previewBox}
                  onChange={(next) =>
                    setCrop({
                      x: next.x / scale,
                      y: next.y / scale,
                      width: next.width / scale,
                      height: next.height / scale,
                    })
                  }
                />
              ) : (
                <img
                  src={engine.preview.url}
                  alt="处理结果预览"
                  className="mx-auto max-h-[560px] rounded-lg object-contain"
                />
              )}
            </CardContent>
          </Card>
          {engine.info && (
            <Card>
              <CardContent className="flex items-center gap-4 pt-6 text-sm text-muted-foreground">
                <span>已应用操作：{ops.length}</span>
                <Separator orientation="vertical" className="h-4" />
                <span>预览宽度上限：1600 px</span>
                {engine.busy && <Progress className="ml-auto w-32" />}
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>编辑工具</CardTitle>
            <CardDescription>裁剪、变换、水印与导出</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="crop">裁剪</TabsTrigger>
                <TabsTrigger value="transform">变换</TabsTrigger>
                <TabsTrigger value="watermark">水印</TabsTrigger>
                <TabsTrigger value="export">导出</TabsTrigger>
              </TabsList>

              <TabsContent value="crop" className="space-y-4 pt-4">
                <div className="grid grid-cols-4 gap-2">
                  {aspectRatios.map((ratio) => (
                    <Button
                      key={ratio.label}
                      variant="outline"
                      size="sm"
                      onClick={() => applyRatio(ratio.value)}
                      disabled={!engine.info || ratio.value === 0}
                    >
                      {ratio.label}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(["x", "y", "width", "height"] as const).map((field) => (
                    <div key={field} className="space-y-1">
                      <Label>
                        {field === "width"
                          ? "宽度"
                          : field === "height"
                            ? "高度"
                            : field.toUpperCase()}
                      </Label>
                      <Input
                        type="number"
                        value={Math.round(crop[field])}
                        onChange={(event) =>
                          setCrop({ ...crop, [field]: Number(event.target.value) || 0 })
                        }
                      />
                    </div>
                  ))}
                </div>
                <Button className="w-full" onClick={syncCrop} disabled={!engine.info}>
                  应用裁剪
                </Button>
              </TabsContent>

              <TabsContent value="transform" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>顺时针旋转 90° 倍数</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" onClick={() => addRotate(90, false)}>
                      90°
                    </Button>
                    <Button variant="outline" onClick={() => addRotate(180, false)}>
                      180°
                    </Button>
                    <Button variant="outline" onClick={() => addRotate(270, false)}>
                      270°
                    </Button>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>任意角度：{angle}°</Label>
                  <Slider
                    value={[angle]}
                    min={0}
                    max={359}
                    onValueChange={([value]) => setAngle(value)}
                  />
                  <div className="flex items-center justify-between">
                    <Label htmlFor="expand">保持四角完整</Label>
                    <Switch id="expand" checked={expand} onCheckedChange={setExpand} />
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => addRotate(angle)}>
                    应用角度
                  </Button>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>镜像翻转</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => addFlip("horizontal")}>
                      水平翻转
                    </Button>
                    <Button variant="outline" onClick={() => addFlip("vertical")}>
                      垂直翻转
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="watermark" className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="watermark-enabled">启用水印</Label>
                  <Switch
                    id="watermark-enabled"
                    checked={watermarkEnabled}
                    onCheckedChange={setWatermarkEnabled}
                  />
                </div>
                <Tabs value={watermark.mode}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger
                      value="text"
                      onClick={() => setWatermark({ ...watermark, mode: "text" })}
                    >
                      文字
                    </TabsTrigger>
                    <TabsTrigger
                      value="image"
                      onClick={() => setWatermark({ ...watermark, mode: "image" })}
                    >
                      图片
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {watermark.mode === "text" ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>文字内容</Label>
                      <Input
                        value={watermark.text}
                        onChange={(event) =>
                          setWatermark({ ...watermark, text: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>字号：{watermark.fontSize}px</Label>
                      <Slider
                        value={[watermark.fontSize]}
                        min={12}
                        max={160}
                        onValueChange={([value]) => setWatermark({ ...watermark, fontSize: value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>颜色</Label>
                      <Input
                        type="color"
                        value={watermark.color}
                        onChange={(event) =>
                          setWatermark({ ...watermark, color: event.target.value })
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <Input
                    type="file"
                    accept="image/png,image/webp"
                    onChange={(event) => onWatermarkFile(event.target.files?.[0])}
                  />
                )}
                <div className="space-y-1">
                  <Label>不透明度：{Math.round(watermark.opacity * 100)}%</Label>
                  <Slider
                    value={[watermark.opacity]}
                    min={0.05}
                    max={1}
                    step={0.05}
                    onValueChange={([value]) => setWatermark({ ...watermark, opacity: value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>宽度占比：{Math.round(watermark.widthRatio * 100)}%</Label>
                  <Slider
                    value={[watermark.widthRatio]}
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    onValueChange={([value]) => setWatermark({ ...watermark, widthRatio: value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>水平位置：{Math.round(watermark.xRatio * 100)}%</Label>
                    <Slider
                      value={[watermark.xRatio]}
                      min={0}
                      max={1}
                      step={0.05}
                      onValueChange={([value]) => setWatermark({ ...watermark, xRatio: value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>垂直位置：{Math.round(watermark.yRatio * 100)}%</Label>
                    <Slider
                      value={[watermark.yRatio]}
                      min={0}
                      max={1}
                      step={0.05}
                      onValueChange={([value]) => setWatermark({ ...watermark, yRatio: value })}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="export" className="space-y-4 pt-4">
                <div className="space-y-1">
                  <Label>输出格式</Label>
                  <Select
                    value={format}
                    onValueChange={(value) => setFormat(value as ExportFormat)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jpeg">JPEG</SelectItem>
                      <SelectItem value="png">PNG</SelectItem>
                      <SelectItem value="webp">WebP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {format !== "png" && (
                  <div className="space-y-1">
                    <Label>质量：{quality}</Label>
                    <Slider
                      value={[quality]}
                      min={40}
                      max={100}
                      onValueChange={([value]) => setQuality(value)}
                    />
                  </div>
                )}
                <Button
                  className="w-full"
                  onClick={onExport}
                  disabled={!engine.info || engine.busy}
                >
                  <Download className="mr-2 h-4 w-4" />
                  导出并下载
                </Button>
                {exportSize !== null && (
                  <p className="text-center text-sm text-muted-foreground">
                    文件大小：{(exportSize / 1024).toFixed(1)} KB
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
