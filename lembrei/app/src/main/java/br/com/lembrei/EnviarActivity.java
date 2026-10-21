package br.com.lembrei;

import android.app.Activity;
import android.app.NotificationManager;
import android.os.Bundle;

/** Janela invisível do botão "Enviar agora" do aviso: silencia o alarme e abre o WhatsApp. */
public class EnviarActivity extends Activity {
    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(getIntent().getIntExtra("id", 0)); // cancelar a notificação também silencia o som
        Whats.abrir(this, getIntent().getStringExtra("fone"), getIntent().getStringExtra("texto"), true);
    }
}
