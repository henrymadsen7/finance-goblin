"""Local MiniLM embeddings. No network, transcript files, or external memory service."""
import sys,json,os,contextlib,logging
os.environ['HF_HUB_OFFLINE']='1'
logging.disable(logging.CRITICAL)
MODEL='Xenova/all-MiniLM-L6-v2'
REVISION='751bff37182d3f1213fa05d7196b954e230abad9'
try:
    with contextlib.redirect_stdout(sys.stderr):
        from huggingface_hub import hf_hub_download
        from tokenizers import Tokenizer
        import onnxruntime as ort
        import numpy as np
        tokenizer=Tokenizer.from_file(hf_hub_download(MODEL,'tokenizer.json',revision=REVISION,local_files_only=True))
        tokenizer.enable_truncation(max_length=384)
        tokenizer.enable_padding()
        options=ort.SessionOptions(); options.intra_op_num_threads=2
        session=ort.InferenceSession(hf_hub_download(MODEL,'onnx/model_quantized.onnx',revision=REVISION,local_files_only=True),sess_options=options,providers=['CPUExecutionProvider'])
    for line in sys.stdin:
        try:
            data=json.loads(line); texts=data['texts']
            if len(texts)>32 or any(len(t)>12000 for t in texts):raise ValueError()
            batch=tokenizer.encode_batch(texts)
            ids=np.array([b.ids for b in batch],dtype=np.int64)
            mask=np.array([b.attention_mask for b in batch],dtype=np.int64)
            inputs={'input_ids':ids,'attention_mask':mask,'token_type_ids':np.array([b.type_ids for b in batch],dtype=np.int64)}
            inputs={i.name:inputs[i.name] for i in session.get_inputs()}
            hidden=session.run(None,inputs)[0]
            expanded=mask[:,:,None].astype(np.float32)
            pooled=(hidden*expanded).sum(axis=1)/np.maximum(expanded.sum(axis=1),1)
            normalized=pooled/np.maximum(np.linalg.norm(pooled,axis=1,keepdims=True),1e-12)
            print(json.dumps({'id':data['id'],'vectors':normalized.round(6).tolist()}),flush=True)
        except Exception:
            print(json.dumps({'id':data.get('id'),'error':'Local embedding failed.'}),flush=True)
except Exception:
    print(json.dumps({'error':'Local MiniLM model or runtime unavailable.'}),flush=True)
