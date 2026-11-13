/** Seek by media time; this does not guarantee frame-exact indexing for variable-frame-rate video. */
export async function seekPoseReferenceFrame(video, time, isFirst) {
  const epsilon = 0.000001;
  // Some browsers clamp tiny positive frame-zero seeks and never emit `seeked`.
  if (video.currentTime === 0 && time > 0 && time < .001) {
    if (!isFirst) throw new Error('Two reference times resolve too close to frame zero to distinguish.');
    return;
  }
  if (Math.abs(video.currentTime - time) <= epsilon) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Annotated-frame seek timed out.')), 15000);
    video.onseeked = () => {
      clearTimeout(timer);
      if (Math.abs(video.currentTime - time) > .001) reject(new Error('Decoded video position does not match the annotated frame time.'));
      else resolve();
    };
    video.onerror = () => { clearTimeout(timer); reject(new Error('Could not seek to annotated frame.')); };
    video.currentTime = time;
  });
}
