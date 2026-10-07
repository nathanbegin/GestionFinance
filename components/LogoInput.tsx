"use client";

const MAX_SIDE = 256;

/** Champ de logo : l'image choisie est réduite (256 px max, PNG) avant l'envoi. */
export default function LogoInput({ name = "logo" }: { name?: string }) {
  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file || !file.type.startsWith("image/") || file.type === "image/svg+xml") return;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) return;
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "logo.png", { type: "image/png" }));
      input.files = dt.files;
    } catch {
      /* format illisible par le navigateur : le serveur validera le fichier d'origine */
    }
  }
  return <input name={name} type="file" accept="image/png,image/jpeg,image/webp" onChange={onChange} />;
}
