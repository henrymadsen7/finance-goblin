"""Local-only voice transcription. Audio is supplied on stdin and never saved."""
import sys,json,base64,io,contextlib,logging,os
os.environ['HF_HUB_OFFLINE']='1'
logging.disable(logging.CRITICAL)
try:
    data=json.load(sys.stdin)
    audio=base64.b64decode(data['base64'],validate=True)
    if len(audio)>3000000: raise ValueError('Audio too large')
    with contextlib.redirect_stdout(sys.stderr):
        from faster_whisper import WhisperModel
        model=WhisperModel('base',device='cpu',compute_type='int8',local_files_only=True)
        segments,info=model.transcribe(io.BytesIO(audio),beam_size=1,vad_filter=True)
        text=' '.join(s.text.strip() for s in segments)[:12000]
    print(json.dumps({'text':text}))
except Exception:
    print(json.dumps({'error':'Local transcription is unavailable. The cached faster-whisper base model and runtime are required.'}))
    sys.exit(1)
