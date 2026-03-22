import os
import logging

from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage

from src.agent.prompts import SYSTEM_PROMPT
from src.agent.tools import ALL_TOOLS, set_request_context

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

_agent = None


def _get_llm():
    return ChatOpenAI(
        model=os.environ.get("ZAI_MODEL", "glm-4.7-flash"),
        openai_api_key=os.environ["ZAI_API_KEY"],
        openai_api_base="https://api.z.ai/api/paas/v4/",
        temperature=0.3,
        max_tokens=1024,
    )


def _get_agent():
    global _agent
    if _agent is None:
        llm = _get_llm()
        _agent = create_agent(
            model=llm,
            tools=ALL_TOOLS,
            system_prompt=SYSTEM_PROMPT,
            debug=os.environ.get("AGENT_VERBOSE", "").lower() == "true",
        )
    return _agent


def run_agent(text: str, slack_user_id: str, channel_id: str, say, client=None) -> str:
    """Run the agent with a user message and return the response text."""
    set_request_context(say, slack_user_id, client)
    logger.info(f"[AGENT] Request started | user={slack_user_id} channel={channel_id}")
    logger.info(f"[AGENT] Prompt: {text}")
    try:
        agent = _get_agent()
        result = agent.invoke({"messages": [HumanMessage(content=text)]})
        messages = result.get("messages", [])

        # Log tool usage
        for msg in messages:
            if msg.type == "ai" and hasattr(msg, "tool_calls") and msg.tool_calls:
                for tc in msg.tool_calls:
                    logger.info(f"[AGENT] Tool call: {tc['name']}({tc['args']})")
            elif msg.type == "tool":
                tool_name = getattr(msg, "name", "unknown")
                content_preview = str(msg.content)[:200]
                logger.info(f"[AGENT] Tool result ({tool_name}): {content_preview}")

        # Get the last AI message content
        for msg in reversed(messages):
            if hasattr(msg, "content") and msg.content and msg.type == "ai":
                logger.info(f"[AGENT] Response: {msg.content}")
                return msg.content
        logger.info("[AGENT] Response: (no content)")
        return "I wasn't able to process that request."
    except Exception as e:
        logger.error(f"[AGENT] Error: {e}")
        return f"Sorry, I encountered an error: {e}"
