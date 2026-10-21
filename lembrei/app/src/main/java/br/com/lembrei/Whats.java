package br.com.lembrei;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.Toast;

/** Abre o WhatsApp na conversa com o texto pronto, pedindo para destravar a tela se ela estiver bloqueada. */
final class Whats {

    private Whats() { }

    static void abrir(final Activity a, final String fone, final String texto, final boolean fecharSeFalhar) {
        final Runnable abrir = () -> {
            Uri u = Uri.parse("https://wa.me/" + fone + "?text=" + Uri.encode(texto));
            for (String pacote : new String[]{"com.whatsapp", "com.whatsapp.w4b", null}) {
                Intent i = new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (pacote != null) i.setPackage(pacote);
                try {
                    a.startActivity(i);
                    a.finish();
                    return;
                } catch (ActivityNotFoundException | SecurityException ignorado) { }
            }
            Toast.makeText(a, "Não consegui abrir o WhatsApp.", Toast.LENGTH_LONG).show();
            if (fecharSeFalhar) a.finish();
        };
        KeyguardManager km = (KeyguardManager) a.getSystemService(Activity.KEYGUARD_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && km != null && km.isKeyguardLocked()) {
            km.requestDismissKeyguard(a, new KeyguardManager.KeyguardDismissCallback() {
                @Override public void onDismissSucceeded() { abrir.run(); }
                @Override public void onDismissError() {
                    Toast.makeText(a, "Desbloqueie o celular e toque de novo.", Toast.LENGTH_LONG).show();
                    if (fecharSeFalhar) a.finish();
                }
                @Override public void onDismissCancelled() { if (fecharSeFalhar) a.finish(); }
            });
        } else {
            abrir.run();
        }
    }
}
