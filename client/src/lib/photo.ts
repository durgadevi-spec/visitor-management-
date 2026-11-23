export function compressPhoto(source: CanvasImageSource, width: number, height: number): Promise<string> {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return Promise.reject(new Error("The selected photo has invalid dimensions."));
  }

  const maxDimension = 1280;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Unable to process the selected photo."));
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to process the selected photo."));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Unable to read the processed photo."));
      };
      reader.onerror = () => reject(new Error("Unable to read the processed photo."));
      reader.readAsDataURL(blob);
    }, "image/jpeg", 0.8);
  });
}
