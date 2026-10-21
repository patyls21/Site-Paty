package br.com.lembrei;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Plano de avisos: o app (página) manda a lista dos próximos envios [{t, k, titulo, nome, fone, texto}] e o aparelho
 * agenda um alarme para o próximo. Na hora, mostra uma notificação; ao tocar, abre o WhatsApp com a conversa e o
 * texto prontos. Quem recebe vê a mensagem vindo do seu número, sem saber que foi lembrada por um app.
 */
final class Plano {

    private static final String PREFS = "plano";
    private static final String CANAL = "lembretes";
    private static final long JANELA_MS = 12L * 3600 * 1000; // aviso atrasado (celular desligado) ainda aparece por 12h

    private Plano() { }

    static void salvar(Context c, String json) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("plano", json == null ? "[]" : json).putBoolean("renovarAvisado", false).apply();
        reagendar(c);
    }

    /** Agenda o alarme do próximo aviso que ainda está no futuro. */
    static void reagendar(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.cancel(intencao(c));
        long agora = System.currentTimeMillis(), melhor = Long.MAX_VALUE;
        try {
            JSONArray p = new JSONArray(prefs(c).getString("plano", "[]"));
            for (int i = 0; i < p.length(); i++) {
                long t = p.getJSONObject(i).getLong("t");
                if (t > agora && t < melhor) melhor = t;
            }
        } catch (Exception ignorado) { }
        if (melhor == Long.MAX_VALUE) return;
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, melhor, intencao(c));
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, melhor, intencao(c));
        }
    }

    /** Chamado pelo alarme e ao ligar o celular: mostra o que já está na hora e agenda o seguinte. */
    static void disparar(Context c) {
        SharedPreferences sp = prefs(c);
        long agora = System.currentTimeMillis();
        try {
            JSONArray p = new JSONArray(sp.getString("plano", "[]"));
            JSONArray mostrados = new JSONArray(sp.getString("mostrados", "[]"));
            JSONArray novos = new JSONArray();
            boolean haFuturo = false;
            for (int i = 0; i < p.length(); i++) {
                JSONObject o = p.getJSONObject(i);
                long t = o.getLong("t");
                String k = o.getString("k");
                if (t > agora) { haFuturo = true; continue; }
                boolean jaFoi = contem(mostrados, k);
                if (!jaFoi && agora - t <= JANELA_MS) {
                    mostrar(c, k.hashCode(), "Lembrei: " + o.getString("titulo"),
                            "Toque para mandar a " + o.getString("nome") + " pelo WhatsApp", o.getString("fone"), o.getString("texto"));
                    jaFoi = true;
                }
                if (jaFoi) novos.put(k);
            }
            sp.edit().putString("mostrados", novos.toString()).apply();
            if (!haFuturo && p.length() > 0 && !sp.getBoolean("renovarAvisado", false)) {
                mostrar(c, 1, "Lembrei: renove os avisos", "Abra o app para programar os próximos dias.", null, null);
                sp.edit().putBoolean("renovarAvisado", true).apply();
            }
        } catch (Exception ignorado) { }
        reagendar(c);
    }

    /** Notificação imediata para conferir se está tudo funcionando. */
    static void testar(Context c, String nome, String fone) {
        mostrar(c, 2, "Lembrei: teste", "Toque para abrir a conversa com " + nome, fone, "✅ Teste do Lembrei!");
    }

    private static void mostrar(Context c, int id, String titulo, String texto, String fone, String msg) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CANAL, "Lembretes", NotificationManager.IMPORTANCE_HIGH));
        }
        Intent ir = fone == null
                ? new Intent(c, MainActivity.class)
                : new Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/" + fone + "?text=" + Uri.encode(msg)));
        PendingIntent toque = PendingIntent.getActivity(c, id, ir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CANAL) : new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setStyle(new Notification.BigTextStyle().bigText(msg == null ? texto : texto + "\n\n" + msg))
                .setContentIntent(toque)
                .setAutoCancel(true);
        nm.notify(id, b.build());
    }

    private static boolean contem(JSONArray a, String k) throws Exception {
        for (int i = 0; i < a.length(); i++) if (k.equals(a.getString(i))) return true;
        return false;
    }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private static PendingIntent intencao(Context c) {
        return PendingIntent.getBroadcast(c, 0, new Intent(c, ReceptorLembrei.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
