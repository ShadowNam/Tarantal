// v1.6 (D-042): when to offer "a new version is ready". The service worker (tools/serviceWorker.ts)
// carries the id of the build it was made with and answers BUILD_MESSAGE with it; the page compares
// it with its own. Navigations are network first, so after a deploy the page usually already runs
// the new build when the new worker takes over: then there is nothing to reload. Pure (unit-tested).

/** The message a page posts to its worker (over a MessageChannel) to ask for the worker's build. */
export const BUILD_MESSAGE = 'tm-build';

/** A build's id: its commit and UTC build time (the build stamp's facts, D-042). */
export function buildIdOf(sha: string, time: string): string {
  return `${sha}@${time}`;
}

/**
 * Offer a reload only when a worker controlled the page before (a deploy landed under it, not the
 * first install) and the worker now in charge says it serves another build. A worker that doesn't
 * answer (null) is no reason to interrupt the player.
 */
export function shouldOfferUpdate(
  hadWorker: boolean,
  running: string,
  workerBuild: string | null,
): boolean {
  return hadWorker && workerBuild !== null && workerBuild !== running;
}
