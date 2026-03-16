"""
TrackerMode v2.6 — AI Session Analyzer
Sends session data to OpenAI for productivity coaching analysis.
"""

import os
import json


async def analyze_session_with_ai(session_data: dict) -> str:
    """Send session data to OpenAI for analysis and suggestions."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return "❌ OpenAI API key not found in .env file."

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)

        # Build app time summary for AI context
        app_time_str = ""
        window_time = session_data.get("windowTimeData", [])
        if window_time:
            top_apps = window_time[:5]  # top 5 apps
            app_lines = [f"  - {a['app']}: {a['duration']} ({a['percentage']}%)" for a in top_apps]
            app_time_str = "\n- Top Apps Used:\n" + "\n".join(app_lines)

        prompt = f"""You are a productivity coach AI analyzing a focus session.
Provide a very brief analysis. Return your response in simple markdown containing NO headings, just short bullet points and bold text for emphasis.
Keep it extremely concise (3-4 bullet points max) and actionable. Use emoji.

Session Data:
- Task: {session_data.get('taskName', 'Unknown')}
- Duration: {session_data.get('durationFormatted', '00:00')} ({session_data.get('duration', 0)} seconds)
- Average Focus Score: {session_data.get('avgFocus', 0) or 0}%
- Total Alerts Triggered: {session_data.get('notifications', 0)}
- Quizzes Triggered: {session_data.get('quizzes', 0)}
- Focus Score History (sampled): {json.dumps(session_data.get('focusSample', []))}{app_time_str}
"""

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a supportive, very concise productivity coach AI."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=300,
            temperature=0.7
        )

        return response.choices[0].message.content or ""
    except Exception as e:
        return f"❌ AI Analysis error: {str(e)}"
