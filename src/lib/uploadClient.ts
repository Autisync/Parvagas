import { apiUrl } from "@/lib/api";

type UploadOptions = {
  path: string;
  formData: FormData;
  token?: string;
  captchaToken?: string | null;
  onProgress?: (progress: number) => void;
};

export function uploadWithProgress({ path, formData, token, captchaToken, onProgress }: UploadOptions) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl(path));
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (captchaToken) xhr.setRequestHeader("x-captcha-token", captchaToken);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
      onProgress?.(progress);
    };

    xhr.onload = () => {
      onProgress?.(100);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }

      try {
        const parsed = JSON.parse(xhr.responseText || "{}");
        reject(new Error(parsed.error || `HTTP ${xhr.status}`));
      } catch {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Não foi possível ligar ao servidor."));
    xhr.send(formData);
  });
}