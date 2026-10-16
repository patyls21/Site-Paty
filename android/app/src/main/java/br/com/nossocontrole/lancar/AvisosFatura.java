package br.com.nossocontrole.lancar;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Avisos da fatura do cartão: o site manda o plano (um aviso por dia, de hoje até a véspera do vencimento)
 * e o aparelho dispara cada um às 9h, mesmo com o app fechado. Plano vazio = cancela tudo.
 */
final class AvisosFatura {

    private static final String PREFS = "avisos";
    private static final String CANAL = "fatura";
    private static final int HORA = 9;

    private AvisosFatura() { }

    static void salvar(Context c, String planoJson) {
        SharedPreferences.Editor ed = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        ed.putString("plano", planoJson == null ? "[]" : planoJson).apply();
        avisarHojeSePerdeu(c);
        reagendar(c);
    }

    /** Se o aviso de hoje já devia ter saído (passou das 9h) e ainda não saiu, mostra agora. */
    private static void avisarHojeSePerdeu(Context c) {
        try {
            SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            Calendar h = Calendar.getInstance();
            String hoje = String.format(java.util.Locale.US, "%04d-%02d-%02d", h.get(Calendar.YEAR), h.get(Calendar.MONTH) + 1, h.get(Calendar.DAY_OF_MONTH));
            if (hoje.equals(sp.getString("ultimo", "")) || System.currentTimeMillis() < momento(hoje)) return;
            JSONArray plano = new JSONArray(sp.getString("plano", "[]"));
            for (int i = 0; i < plano.length(); i++) {
                JSONObject o = plano.getJSONObject(i);
                if (hoje.equals(o.getString("data"))) {
                    sp.edit().putString("ultimo", hoje).apply();
                    mostrar(c, o.getString("titulo"), o.getString("texto"));
                    return;
                }
            }
        } catch (Exception ignorado) { }
    }

    /** Agenda o próximo aviso do plano que ainda está no futuro (ou cancela, se não sobrou nenhum). */
    static void reagendar(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.cancel(intencao(c, ""));
        try {
            JSONArray plano = new JSONArray(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("plano", "[]"));
            long agora = System.currentTimeMillis(), melhor = Long.MAX_VALUE;
            String dia = null;
            for (int i = 0; i < plano.length(); i++) {
                String data = plano.getJSONObject(i).getString("data");
                long t = momento(data);
                if (t > agora && t < melhor) { melhor = t; dia = data; }
            }
            if (dia != null) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, melhor, intencao(c, dia));
        } catch (Exception ignorado) { }
    }

    /** Chamado pelo alarme: mostra o aviso do dia (se ainda estiver no plano) e agenda o seguinte. */
    static void disparar(Context c, String dia) {
        try {
            JSONArray plano = new JSONArray(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("plano", "[]"));
            for (int i = 0; i < plano.length(); i++) {
                JSONObject o = plano.getJSONObject(i);
                if (dia.equals(o.getString("data"))) { c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("ultimo", dia).apply(); mostrar(c, o.getString("titulo"), o.getString("texto")); break; }
            }
        } catch (Exception ignorado) { }
        reagendar(c);
    }

    private static void mostrar(Context c, String titulo, String texto) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CANAL, "Fatura do cartão", NotificationManager.IMPORTANCE_HIGH));
        }
        PendingIntent abrir = PendingIntent.getActivity(c, 1, new Intent(c, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CANAL) : new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setStyle(new Notification.BigTextStyle().bigText(texto))
                .setContentIntent(abrir)
                .setAutoCancel(true);
        nm.notify(1001, b.build());
    }

    private static PendingIntent intencao(Context c, String dia) {
        Intent i = new Intent(c, ReceptorAviso.class).putExtra("dia", dia);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** "2026-10-17" -> esse dia às 9h, no horário do aparelho. */
    private static long momento(String data) {
        String[] p = data.split("-");
        Calendar cal = Calendar.getInstance();
        cal.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]), HORA, 0, 0);
        cal.set(Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis();
    }
}
