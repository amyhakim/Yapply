'use client';
import { useEffect, useRef } from 'react';
import { CameraOff } from 'lucide-react';

export function CameraPreview({ stream }: { stream: MediaStream | null }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (element) element.srcObject = stream;
    return () => { if (element) element.srcObject = null; };
  }, [stream]);
  return stream ? <video ref={video} className="portrait" autoPlay muted playsInline style={{ transform: 'scaleX(-1)' }}/>
    : <div className="camera-placeholder"><CameraOff size={28}/><span>Your camera is off</span></div>;
}
