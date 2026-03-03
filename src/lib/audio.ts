// Pure audio utilities – NO REACT, NO JSX
export async function testMicrophone(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch {
    return false;
  }
}

export function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
  ];
  
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export async function recordAudio(durationMs: number = 5000): Promise<Blob | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getSupportedMimeType();
    
    return new Promise((resolve) => {
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType: mimeType || undefined });
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        resolve(blob);
      };
      
      recorder.start();
      setTimeout(() => recorder.stop(), durationMs);
    });
  } catch {
    return null;
  }
}