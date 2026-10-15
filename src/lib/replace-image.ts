// Checkpoints deliberately precede non-idempotent Dutchie calls. An interrupted
// upload is not automatically repeated: Dutchie does not offer idempotency keys.
export interface ImageMapping { imageId: number; imageUrl: string }
export interface ReplacementState {
  phase: "planned" | "uploading" | "uploaded" | "done";
  oldImages?: ImageMapping[];
  newImage?: ImageMapping;
  removedIds?: number[];
  deletingId?: number;
  fingerprint?: string;
}
export interface ReplacementDependencies {
  save: (state: ReplacementState) => Promise<void>;
  mappings: () => Promise<ImageMapping[]>;
  upload: () => Promise<{ imageId: number; imageUrl: string | null }>;
  record: (image: ImageMapping) => Promise<void>;
  remove: (imageId: number) => Promise<{ result: boolean; message: string | null }>;
  forget: (imageId: number) => Promise<void>;
}
export async function replaceImage(
  state: ReplacementState,
  oldUrls: string[],
  fingerprint: string,
  deps: ReplacementDependencies,
): Promise<ImageMapping> {
  if (state.fingerprint && state.fingerprint !== fingerprint) {
    throw new Error("This replacement was started with a different image. Use the original queued image.");
  }
  if (state.phase === "done") return state.newImage!;
  if (state.phase === "uploading") {
    throw new Error("The previous upload outcome is uncertain. Check this product in Dutchie before trying a new replacement; no old images were deleted.");
  }
  if (state.phase === "planned") {
    const mappings = await deps.mappings();
    const missing = oldUrls.filter(url => !mappings.some(image => image.imageUrl === url));
    if (missing.length) throw new Error(`${missing.length} existing image(s) have no recorded ID. No images were changed.`);
    // Keep every matching ID, including separate images with an identical URL.
    state.oldImages = mappings.filter(image => oldUrls.includes(image.imageUrl));
    state.fingerprint = fingerprint;
    state.phase = "uploading";
    await deps.save(state);
    let image: Awaited<ReturnType<ReplacementDependencies["upload"]>>;
    try {
      image = await deps.upload();
    } catch (error) {
      if ((error as { status?: number })?.status === 429) {
        // A confirmed rate-limit rejection did not accept the upload.
        state.phase = "planned";
        await deps.save(state);
      }
      throw error;
    }
    if (!Number.isSafeInteger(image.imageId) || image.imageId <= 0 || !image.imageUrl) {
      throw new Error("Dutchie did not confirm the new image. Check the product before retrying; no old images were deleted.");
    }
    state.newImage = { imageId: image.imageId, imageUrl: image.imageUrl };
    state.phase = "uploaded";
    state.removedIds = [];
    await deps.save(state);
  }
  const newImage = state.newImage!;
  await deps.record(newImage);
  for (const old of state.oldImages ?? []) {
    if (old.imageId === newImage.imageId) continue;
    if (state.removedIds?.includes(old.imageId)) {
      // A previous request may have stopped between checkpoint and DB cleanup.
      await deps.forget(old.imageId);
      continue;
    }
    if (state.deletingId === old.imageId) {
      throw new Error(`The deletion outcome for image ${old.imageId} is uncertain. The new image is saved; check this product in Dutchie before continuing.`);
    }
    state.deletingId = old.imageId;
    await deps.save(state);
    let result: Awaited<ReturnType<ReplacementDependencies["remove"]>>;
    try {
      result = await deps.remove(old.imageId);
    } catch (error) {
      if ((error as { status?: number })?.status === 429) {
        delete state.deletingId;
        await deps.save(state);
      }
      throw error;
    }
    if (!result.result) {
      delete state.deletingId;
      await deps.save(state);
      throw new Error(`New image saved, but an old image could not be removed: ${result.message || old.imageId}. Retry to continue removal without uploading again.`);
    }
    state.removedIds = [...(state.removedIds ?? []), old.imageId];
    delete state.deletingId;
    await deps.save(state);
    await deps.forget(old.imageId);
  }
  state.phase = "done";
  await deps.save(state);
  return newImage;
}
