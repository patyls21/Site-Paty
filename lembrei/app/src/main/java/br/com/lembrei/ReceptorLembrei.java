package br.com.lembrei;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Recebe o alarme do próximo aviso, a soneca ("Adiar 10 min") e a reinicialização do aparelho. */
public class ReceptorLembrei extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if ("ADIAR".equals(i.getAction())) {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(i.getIntExtra("id", 0));
            Plano.adiar(c, i.getStringExtra("k"), i.getStringExtra("titulo"), i.getStringExtra("nome"), i.getStringExtra("fone"), i.getStringExtra("texto"));
            return;
        }
        Plano.disparar(c);
    }
}
