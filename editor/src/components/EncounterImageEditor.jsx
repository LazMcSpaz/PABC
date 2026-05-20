import { useEffect, useState } from "react";
import { ImageCropper } from "./ImageCropper.jsx";
import {
  uploadImage,
  deleteImage,
  loadImageDataUri,
  pathForImage,
} from "../lib/images.js";
import { githubConfigured } from "../lib/github.js";

// Shared image authoring control used wherever encounters are edited:
// quest beats, world encounters, field encounters. Same 3:2 cropper,
// same fade overlay preview, same auto-naming from id.

export function EncounterImageEditor({ kind, id, imagePath, onChange }) {
  const [pickedFile, setPickedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const configured = githubConfigured();

  useEffect(() => {
    if (!imagePath || !configured) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    loadImageDataUri(imagePath)
      .then((uri) => {
        if (!cancelled) setPreview(uri);
      })
      .catch((e) => {
        if (!cancelled) setError(`preview failed: ${e.message}`);
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [imagePath, configured]);

  const targetPath = id ? pathForImage(kind, id) : null;

  const onPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPickedFile(file);
    e.target.value = "";
  };

  const onCropConfirm = async (blob) => {
    setPickedFile(null);
    setBusy(true);
    setError(null);
    try {
      const result = await uploadImage({ kind, id, blob });
      onChange(result.path);
      const uri = await loadImageDataUri(result.path);
      setPreview(uri);
    } catch (e) {
      setError(`upload failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    if (
      !confirm(
        "Remove this image? The file will be deleted from the content branch.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await deleteImage({ path: imagePath });
      onChange(null);
      setPreview(null);
    } catch (e) {
      setError(`delete failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs uppercase tracking-wide text-slate-400">
        image (3:2, rightmost third fades in-game)
      </div>

      {!configured && (
        <div className="text-xs text-rose-400">
          GitHub sync not configured — set VITE_GITHUB_TOKEN and VITE_GITHUB_REPO
          to enable image uploads.
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="w-64 aspect-[3/2] bg-slate-950/60 border border-slate-800 rounded overflow-hidden relative flex items-center justify-center">
          {loadingPreview && (
            <span className="text-xs text-slate-500">loading…</span>
          )}
          {!loadingPreview && preview && (
            <>
              <img
                src={preview}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div
                className="absolute top-0 bottom-0 right-0 flex items-center justify-center pointer-events-none"
                style={{
                  width: "33.3333%",
                  background:
                    "linear-gradient(to right, rgba(15,23,42,0.15), rgba(15,23,42,0.85))",
                }}
              >
                <span className="text-slate-100 text-[10px] uppercase tracking-[0.3em] font-semibold opacity-70">
                  fade
                </span>
              </div>
            </>
          )}
          {!loadingPreview && !preview && (
            <span className="text-xs text-slate-500">no image</span>
          )}
        </div>

        <div className="flex flex-col gap-2 text-xs text-slate-300">
          {imagePath && (
            <div>
              <span className="text-slate-500">path</span>
              <div className="font-mono break-all text-slate-300 max-w-md">
                {imagePath}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label
              className={`px-2 py-1 rounded border cursor-pointer ${
                configured && !busy && id
                  ? "bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200"
                  : "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
              }`}
            >
              {imagePath ? "replace…" : "upload image…"}
              <input
                type="file"
                accept="image/*"
                disabled={!configured || busy || !id}
                onChange={onPick}
                className="hidden"
              />
            </label>
            {imagePath && (
              <button
                type="button"
                onClick={onRemove}
                disabled={busy}
                className="px-2 py-1 text-xs rounded bg-rose-900/60 hover:bg-rose-800 border border-rose-800 text-rose-100 disabled:opacity-50"
              >
                remove
              </button>
            )}
            {busy && <span className="text-amber-300">working…</span>}
          </div>
          {error && <span className="text-rose-400">{error}</span>}
          {targetPath && (
            <div className="text-slate-500">
              target file: <code>{targetPath}</code>
            </div>
          )}
          {!id && (
            <div className="text-amber-400">
              set an id before uploading — the image is named after it.
            </div>
          )}
        </div>
      </div>

      {pickedFile && id && (
        <ImageCropper
          file={pickedFile}
          id={id}
          targetPath={targetPath}
          onCancel={() => setPickedFile(null)}
          onConfirm={onCropConfirm}
        />
      )}
    </div>
  );
}
