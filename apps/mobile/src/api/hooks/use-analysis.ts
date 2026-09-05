/**
 * Form analysis: consent, upload, and reading a result back.
 *
 * The upload does NOT go through our API — the client asks for a presigned
 * target and then PUTs straight to R2. So `uploadSetVideo` is the one mutation
 * in the app that talks to something other than our own server, and it is
 * written as three explicit steps rather than one opaque call, because each
 * fails differently and the UI needs to say which:
 *
 *   1. ask   — our API. Refused without consent, or if storage is off.
 *   2. put   — R2. The slow one; this is where a bad signal shows up.
 *   3. tell  — our API, which queues the work.
 *
 * If step 2 fails, the analysis row is left `awaiting_upload` and simply never
 * queued. That is the right failure: nothing is charged, nothing is analysed,
 * and the row expires with the bucket's lifecycle rule.
 */
import { useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Analysis, MeResponse, VideoUploadTarget } from '@fi/shared';
import { api } from '../client';
import { keys } from '../query-client';

export const analysisKeys = {
  forSet: (setId: string) => ['analyses', 'set', setId] as const,
  forWorkout: (workoutId: string) => ['analyses', 'workout', workoutId] as const,
  one: (analysisId: string) => ['analyses', analysisId] as const,
} as const;

/**
 * Every analysis in a workout, in one request.
 *
 * Deliberately not one query per set: a history screen renders dozens of rows,
 * and asking per row is a round trip each on a connection that is often a
 * phone's. The caller indexes the result by `workoutSetId`.
 */
export function useWorkoutAnalyses(workoutId: string | null) {
  return useQuery({
    queryKey: analysisKeys.forWorkout(workoutId ?? 'none'),
    queryFn: () => api.get<{ items: Analysis[] }>(`/workouts/${workoutId}/analyses`),
    enabled: workoutId !== null,
    select: (data) => {
      // A set can be filmed more than once; the newest is what a history row
      // should open, and the response is already newest-first.
      const bySet = new Map<string, Analysis>();
      for (const item of data.items) {
        if (item.workoutSetId !== null && !bySet.has(item.workoutSetId)) {
          bySet.set(item.workoutSetId, item);
        }
      }
      return bySet;
    },
  });
}

/** Every analysis of a set, newest first. */
export function useSetAnalyses(setId: string | null) {
  return useQuery({
    queryKey: analysisKeys.forSet(setId ?? 'none'),
    queryFn: () => api.get<{ items: Analysis[] }>(`/sets/${setId}/analyses`),
    enabled: setId !== null,
  });
}

/**
 * One analysis, polled while the worker has it.
 *
 * Polling stops the moment it reaches a terminal state, so a finished analysis
 * costs nothing — and a queued one on a cold free instance is not hammered
 * either, because five seconds is slower than a person would tap refresh.
 */
export function useAnalysis(analysisId: string | null) {
  return useQuery({
    queryKey: analysisKeys.one(analysisId ?? 'none'),
    queryFn: () => api.get<Analysis>(`/analyses/${analysisId}`),
    enabled: analysisId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'processing' ? 5000 : false;
    },
  });
}

/** Records consent (FR-VID-01). The API refuses uploads until this succeeds. */
export function useGrantVideoConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<MeResponse>('/me/video-consent'),
    onSuccess: (me) => queryClient.setQueryData(keys.me, me),
  });
}

/** Withdraws it. Deliberately does not delete anything already recorded. */
export function useWithdrawVideoConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<MeResponse>('/me/video-consent'),
    onSuccess: (me) => queryClient.setQueryData(keys.me, me),
  });
}

export interface UploadInput {
  setId: string;
  /** A local file URI, from `recordAsync` or the library picker. */
  uri: string;
  /** The length of the FILE, which may exceed the span to be analysed. */
  durationSecs: number;
  /**
   * Where the analysed window starts, for a video longer than the ceiling.
   * Omitted means from the beginning; the server derives the end.
   */
  clipStartSecs?: number;
}

/** Which of the three steps failed, so the UI can say something useful. */
export type UploadStage = 'ask' | 'put' | 'tell';

export class UploadFailure extends Error {
  constructor(
    readonly stage: UploadStage,
    message: string,
  ) {
    super(message);
    this.name = 'UploadFailure';
  }
}

/**
 * PUTs the file and reports how much of it has gone.
 *
 * XMLHttpRequest, not `fetch`, and that is the whole reason this function
 * exists: `fetch` has no upload-progress event in React Native, so a 45 MB
 * video over a gym's wifi is an indefinite spinner. XHR's `upload.onprogress`
 * is the only way to know, and a real percentage is the difference between
 * waiting and wondering whether it has hung.
 */
function putWithProgress(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);

    // Exactly the headers the presign was signed with. An extra one
    // invalidates the signature and R2 answers 403.
    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }

    request.upload.onprogress = (event) => {
      // `lengthComputable` is false on some Android stacks; reporting a
      // fraction derived from an unknown total would move the bar to a
      // meaningless place, so nothing is reported at all.
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new UploadFailure('put', `Storage rejected the upload (${request.status})`));
      }
    };

    request.onerror = () =>
      reject(new UploadFailure('put', 'The upload was interrupted. Check your connection.'));
    request.onabort = () => reject(new UploadFailure('put', 'The upload was cancelled.'));
    request.ontimeout = () => reject(new UploadFailure('put', 'The upload timed out.'));

    request.send(body);
  });
}

/**
 * The key every in-flight video upload shares, so other screens can ask
 * whether one is running without holding a reference to this hook.
 */
export const UPLOAD_MUTATION_KEY = ['upload-set-video'] as const;

/**
 * True while any set video is still uploading, anywhere in the app.
 *
 * Exists so finishing a workout can be blocked until the file is safely in
 * storage. Leaving the workout tears the screen down and with it the request,
 * and the analysis row is then stranded in `awaiting_upload` forever — the
 * user having done the set, filmed it, and lost it. Reading the mutation
 * cache rather than passing state down means the check works from a screen
 * that never started the upload.
 */
export function useVideoUploadInFlight(): boolean {
  return useIsMutating({ mutationKey: UPLOAD_MUTATION_KEY }) > 0;
}

export function useUploadSetVideo() {
  const queryClient = useQueryClient();
  /** 0 to 1, for the screen that is watching. */
  const [progress, setProgress] = useState(0);

  const mutation = useMutation({
    mutationKey: UPLOAD_MUTATION_KEY,
    mutationFn: async ({
      setId,
      uri,
      durationSecs,
      clipStartSecs,
    }: UploadInput): Promise<Analysis> => {
      setProgress(0);
      /*
       * The size has to be known before asking, because the server refuses an
       * oversized file at presign time rather than after it has crossed
       * someone's mobile data. `fetch` on a file:// URI is the only way to get
       * a Blob's length in React Native without another dependency.
       */
      const file = await fetch(uri);
      const blob = await file.blob();

      const target = await api
        .post<VideoUploadTarget>(`/sets/${setId}/video`, {
          contentLength: blob.size,
          contentType: 'video/mp4',
          durationSecs,
          clipStartSecs,
        })
        .catch((error: unknown) => {
          throw new UploadFailure('ask', error instanceof Error ? error.message : 'Could not start');
        });

      await putWithProgress(target.uploadUrl, target.requiredHeaders, blob, setProgress);

      return api
        .post<Analysis>(`/analyses/${target.analysisId}/uploaded`)
        .catch((error: unknown) => {
          throw new UploadFailure(
            'tell',
            error instanceof Error ? error.message : 'Uploaded, but could not be queued',
          );
        });
    },
    onSuccess: (analysis, { setId }) => {
      void queryClient.invalidateQueries({ queryKey: analysisKeys.forSet(setId) });
      void queryClient.invalidateQueries({ queryKey: ['analyses', 'workout'] });
      queryClient.setQueryData(analysisKeys.one(analysis.id), analysis);
    },
  });

  return { ...mutation, progress };
}

/** Deletes an analysis and its video. A real delete, not an archive. */
export function useDeleteAnalysis(setId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (analysisId: string) => api.delete<{ ok: true }>(`/analyses/${analysisId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: analysisKeys.forSet(setId) }),
  });
}
