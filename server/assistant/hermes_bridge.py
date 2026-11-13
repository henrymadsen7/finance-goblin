"""Narrow adapter for the owner's installed Hermes. Prompts enter on stdin only.
Hermes owns provider authentication. No credentials are returned to Node/browser.
No system tools, global memory, plugins or background agents are enabled here.
The app supplies workspace-scoped memory and validates proposed local actions.
"""
import os, sys, json, contextlib, logging
os.environ["HERMES_SAFE_MODE"]="1"
os.environ["HERMES_IGNORE_USER_CONFIG"]="1"
os.environ["HERMES_IGNORE_RULES"]="1"
logging.disable(logging.CRITICAL)
root=sys.argv[1]
sys.path.insert(0,root)
try:
    payload=json.load(sys.stdin)
    with contextlib.redirect_stdout(sys.stderr):
        from hermes_cli.runtime_provider import resolve_runtime_provider
        runtime=resolve_runtime_provider(requested="openai-codex",target_model=payload.get("model"))
        if runtime.get("provider") != "openai-codex":
            raise RuntimeError("Unexpected provider")
        if payload.get("catalog"):
            from agent.model_metadata import fetch_codex_catalog_entries
            from agent.codex_headers import codex_account_headers
            from agent.reasoning_effort import codex_supported_efforts
            import httpx
            headers={"Authorization":"Bearer "+runtime["api_key"],**codex_account_headers(runtime["api_key"])}
            entries,status=fetch_codex_catalog_entries(lambda url:httpx.get(url,headers=headers,timeout=10))
            models=[]
            for entry in entries:
                slug=entry.get("slug","")
                if not slug or entry.get("visibility") in ["hide","hidden"]: continue
                levels=[r.get("effort") for r in entry.get("supported_reasoning_levels",[]) if r.get("effort") in codex_supported_efforts(slug)]
                models.append({"id":slug,"name":entry.get("display_name") or slug,"reasoning":levels or list(codex_supported_efforts(slug)),"contextWindow":entry.get("context_window"),"source":"live"})
            if not models: raise RuntimeError("Model catalog unavailable")
            result={"models":models,"provider":"openai-codex","outputLimitMode":"local-answer-cap"}
        elif payload.get("probe"):
            result={"ready":True,"provider":"openai-codex"}
        else:
            from run_agent import AIAgent
            from toolsets import create_custom_toolset
            create_custom_toolset("life-platform-context","Context supplied by the Life platform",tools=[])
            agent=AIAgent(model=payload["model"],provider="openai-codex",api_key=runtime.get("api_key"),base_url=runtime.get("base_url"),api_mode=runtime.get("api_mode"),enabled_toolsets=["life-platform-context"],max_iterations=2,max_tokens=payload.get("maxTokens",3000),quiet_mode=True,save_trajectories=False,skip_context_files=True,skip_memory=True,skip_background_review=True,reasoning_config={"effort":payload.get("reasoning","low")},fallback_model=None,cwd=root)
            agent._persist_disabled = True
            agent._skip_mcp_refresh = True
            agent._dump_api_request_debug = lambda *args, **kwargs: None
            if agent.tools:
                raise RuntimeError("Unexpected system tool access")
            message=payload["prompt"]
            if payload.get("images"):
                message=[{"type":"text","text":message}]+[{"type":"image_url","image_url":{"url":"data:"+image["mime"]+";base64,"+image["base64"]}} for image in payload["images"]]
            response=agent.run_conversation(message,system_message=payload["system"])
            if response.get("failed") or response.get("error") or not response.get("completed") or not response.get("final_response"):
                raise RuntimeError("No response")
            result={"text":response["final_response"],"provider":"openai-codex"}
            agent.close()
    print(json.dumps(result))
except Exception:
    print(json.dumps({"error":"Hermes could not complete the request. Check ChatGPT sign-in with hermes model and retry."}))
    sys.exit(1)
