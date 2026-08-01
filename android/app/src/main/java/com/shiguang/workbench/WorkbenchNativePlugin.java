package com.shiguang.workbench;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(
    name = "WorkbenchNative",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class WorkbenchNativePlugin extends Plugin {
    private static final String DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
    private static final String MODEL = "deepseek-chat";
    private static final String TUTOR_PROMPT =
        "You are English Buddy, a patient English speaking partner for a Chinese learner. " +
        "Speak mainly in natural English, keep replies concise (2-4 sentences), gently correct grammar or word choice, " +
        "adapt to the learner's level, and usually end with a question. " +
        "After the English reply, add a new line beginning exactly with '💡 纠错：' followed by a brief Chinese correction. " +
        "If there is no mistake, write '💡 纠错：无'.";

    private TextToSpeech textToSpeech;
    private volatile boolean ttsReady = false;

    @Override
    public void load() {
        textToSpeech = new TextToSpeech(getContext(), status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
        });
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("granted", true));
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionResult");
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        boolean granted = getPermissionState("notifications") == PermissionState.GRANTED;
        call.resolve(new JSObject().put("granted", granted));
    }

    @PluginMethod
    public void exactAlarmStatus(PluginCall call) {
        call.resolve(new JSObject().put("granted", ReminderScheduler.canScheduleExact(getContext())));
    }

    @PluginMethod
    public void requestExactAlarmAccess(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !ReminderScheduler.canScheduleExact(getContext())) {
            Intent intent = new Intent(
                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                Uri.parse("package:" + getContext().getPackageName())
            );
            getActivity().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void scheduleReminder(PluginCall call) {
        Integer id = call.getInt("id");
        Long triggerAt = call.getLong("triggerAt");
        String title = call.getString("title", "提醒");
        if (id == null || triggerAt == null || triggerAt <= System.currentTimeMillis()) {
            call.reject("提醒时间必须晚于现在");
            return;
        }
        boolean exact = ReminderScheduler.schedule(getContext(), id, title, triggerAt, true);
        call.resolve(new JSObject().put("exact", exact));
    }

    @PluginMethod
    public void cancelReminder(PluginCall call) {
        Integer id = call.getInt("id");
        if (id == null) {
            call.reject("缺少提醒编号");
            return;
        }
        ReminderScheduler.cancel(getContext(), id);
        call.resolve();
    }

    @PluginMethod
    public void chat(PluginCall call) {
        String apiKey = call.getString("apiKey", "").trim();
        JSArray history = call.getArray("messages", new JSArray());
        if (apiKey.isEmpty()) {
            call.reject("请先填写 DeepSeek API Key");
            return;
        }
        new Thread(() -> {
            try {
                String systemPrompt = call.getString("systemPrompt", TUTOR_PROMPT);
                if (systemPrompt.trim().isEmpty()) systemPrompt = TUTOR_PROMPT;
                JSONArray messages = new JSONArray();
                messages.put(new JSONObject().put("role", "system").put("content", systemPrompt));
                for (int index = 0; index < history.length(); index++) {
                    JSONObject item = history.optJSONObject(index);
                    if (item == null) continue;
                    String role = item.optString("role", "user");
                    if (!role.equals("user") && !role.equals("assistant")) continue;
                    String text = item.optString("text", "").trim();
                    if (!text.isEmpty()) {
                        messages.put(new JSONObject().put("role", role).put("content", text));
                    }
                }
                String reply = postDeepSeek(apiKey, messages, 0.8);
                call.resolve(new JSObject().put("reply", reply));
            } catch (Exception error) {
                call.reject(cleanError(error));
            }
        }, "WorkbenchChat").start();
    }

    @PluginMethod
    public void translate(PluginCall call) {
        String apiKey = call.getString("apiKey", "").trim();
        String text = call.getString("text", "").trim();
        if (apiKey.isEmpty() || text.isEmpty()) {
            call.reject(apiKey.isEmpty() ? "请先填写 DeepSeek API Key" : "请输入要翻译的内容");
            return;
        }
        new Thread(() -> {
            try {
                boolean chinese = containsCjk(text);
                String prompt = chinese
                    ? "Translate the Chinese text into natural English. Output only the translation."
                    : "Translate the English text into natural Chinese. Output only the translation.";
                JSONArray messages = new JSONArray()
                    .put(new JSONObject().put("role", "system").put("content", prompt))
                    .put(new JSONObject().put("role", "user").put("content", text));
                String translated = postDeepSeek(apiKey, messages, 0.3);
                call.resolve(new JSObject()
                    .put("translated", translated)
                    .put("source", chinese ? "zh" : "en")
                    .put("target", chinese ? "en" : "zh"));
            } catch (Exception error) {
                call.reject(cleanError(error));
            }
        }, "EnglishBuddyTranslate").start();
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        String language = call.getString("language", "en-US");
        if (text.isEmpty()) {
            call.reject("没有可朗读的内容");
            return;
        }
        if (!ttsReady || textToSpeech == null) {
            call.reject("系统朗读服务尚未就绪");
            return;
        }
        Locale locale = language.toLowerCase(Locale.ROOT).startsWith("zh")
            ? Locale.SIMPLIFIED_CHINESE
            : Locale.US;
        textToSpeech.setLanguage(locale);
        textToSpeech.setSpeechRate(0.92f);
        textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, "shiguang-english-buddy");
        call.resolve();
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        if (textToSpeech != null) textToSpeech.stop();
        call.resolve();
    }

    @PluginMethod
    public void startVoiceInput(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionResult");
            return;
        }
        launchVoiceInput(call);
    }

    @PermissionCallback
    private void microphonePermissionResult(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            launchVoiceInput(call);
        } else {
            call.reject("需要麦克风权限才能进行英语语音输入");
        }
    }

    private void launchVoiceInput(PluginCall call) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
            .putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak English")
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        startActivityForResult(call, intent, "voiceInputResult");
    }

    @ActivityCallback
    private void voiceInputResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("没有识别到语音");
            return;
        }
        ArrayList<String> results = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (results == null || results.isEmpty()) {
            call.reject("没有识别到语音");
            return;
        }
        call.resolve(new JSObject().put("text", results.get(0)));
    }

    private String postDeepSeek(String apiKey, JSONArray messages, double temperature) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(DEEPSEEK_ENDPOINT).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Authorization", "Bearer " + apiKey);
            connection.setConnectTimeout(20_000);
            connection.setReadTimeout(60_000);
            connection.setDoOutput(true);
            JSONObject body = new JSONObject()
                .put("model", MODEL)
                .put("messages", messages)
                .put("temperature", temperature)
                .put("stream", false);
            connection.getOutputStream().write(body.toString().getBytes(StandardCharsets.UTF_8));

            int code = connection.getResponseCode();
            InputStream stream = code >= 200 && code < 300
                ? connection.getInputStream()
                : connection.getErrorStream();
            String raw = readAll(stream);
            if (code < 200 || code >= 300) {
                if (code == 401) {
                    throw new Exception("DeepSeek API Key 无效，请检查或重新填写");
                }
                String message = raw;
                try {
                    message = new JSONObject(raw).optJSONObject("error").optString("message", raw);
                } catch (Exception ignored) {}
                throw new Exception(message);
            }
            return new JSONObject(raw)
                .getJSONArray("choices")
                .getJSONObject(0)
                .getJSONObject("message")
                .getString("content")
                .trim();
        } finally {
            connection.disconnect();
        }
    }

    private static String readAll(InputStream stream) throws Exception {
        if (stream == null) return "网络请求失败";
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
        }
        return result.toString();
    }

    private static boolean containsCjk(String text) {
        int count = 0;
        for (int index = 0; index < text.length(); index++) {
            char value = text.charAt(index);
            if ((value >= 0x3400 && value <= 0x4DBF) || (value >= 0x4E00 && value <= 0x9FFF)) {
                if (++count >= 2) return true;
            }
        }
        return false;
    }

    private static String cleanError(Exception error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) return "请求失败，请检查网络与 API Key";
        return message.length() > 260 ? message.substring(0, 260) : message;
    }

    @Override
    protected void handleOnDestroy() {
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
    }
}
