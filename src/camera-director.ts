export interface CameraVector { x: number; y: number; z: number }
export interface CameraPose { position: CameraVector; target: CameraVector }

function clampToField(x: number, z: number, radius: number): { x: number; z: number } {
  const length = Math.hypot(x, z);
  const scale = length > radius ? radius / length : 1;
  return { x: x * scale, z: z * scale };
}

/** Freeze the launch direction so bounces do not whip the camera around. */
export function shotCameraDirection(velocity: CameraVector): CameraVector {
  const length = Math.hypot(velocity.x, velocity.z);
  if (!Number.isFinite(length) || length < 0.001) return { x: 0, y: 0, z: 1 };
  return { x: velocity.x / length, y: 0, z: velocity.z / length };
}

/** Elevated chase view; remains behind the shot in every stadium direction. */
export function followShotPose(ball: CameraVector, direction: CameraVector): CameraPose {
  const position = clampToField(ball.x - direction.x * 12, ball.z - direction.z * 12, 60);
  const approachingRope = Math.hypot(ball.x, ball.z) > 65;
  return {
    position: { x: position.x, y: Math.max(approachingRope ? 14 : 4.5, ball.y + 4.5), z: position.z },
    target: { x: ball.x, y: Math.max(0.4, ball.y), z: ball.z }
  };
}

/** Brief sideline cut once the ball has resolved; never used during input. */
export function shotResultPose(ball: CameraVector, direction: CameraVector): CameraPose {
  // Keep the virtual camera inside the rope, even when a six lands beyond the stands.
  const target = clampToField(ball.x, ball.z, 62);
  const position = clampToField(target.x - direction.x * 11 + direction.z * 12, target.z - direction.z * 11 - direction.x * 12, 55);
  return {
    position: { x: position.x, y: 10, z: position.z },
    target: { x: target.x, y: Math.max(0.4, Math.min(8, ball.y)), z: target.z }
  };
}
