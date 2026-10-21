package br.com.lembrei;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;

/**
 * Casca do Lembrei!: mostra as páginas guardadas dentro do próprio app (nada vem da internet) e entrega
 * ao Android o plano de avisos. Os lembretes ficam só neste aparelho (localStorage).
 */
public class MainActivity extends Activity {

    private static final String HOST = "lembrei.local";
    private WebView web;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        web = new WebView(this);
        setContentView(web);
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        web.addJavascriptInterface(new Ponte(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return vazio();
                String caminho = u.getPath() == null || "/".equals(u.getPath()) ? "index.html" : u.getPath().substring(1);
                try {
                    return new WebResourceResponse(tipo(caminho), "utf-8", getAssets().open(caminho));
                } catch (IOException e) {
                    return vazio();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }
        });
        web.loadUrl("https://" + HOST + "/");
    }

    private static WebResourceResponse vazio() {
        return new WebResourceResponse("text/plain", "utf-8", new java.io.ByteArrayInputStream(new byte[0]));
    }

    private static String tipo(String f) {
        if (f.endsWith(".html")) return "text/html";
        if (f.endsWith(".css")) return "text/css";
        if (f.endsWith(".js") || f.endsWith(".mjs")) return "text/javascript";
        return "application/octet-stream";
    }

    private class Ponte {
        @JavascriptInterface
        public void agendar(String planoJson) { Plano.salvar(getApplicationContext(), planoJson); }

        @JavascriptInterface
        public void testar(String nome, String fone) { Plano.testar(getApplicationContext(), nome, fone); }

        /** Android 14+: deixa o alarme acender a tela por cima do bloqueio. */
        @JavascriptInterface
        public void abrirTelaCheia() {
            if (Build.VERSION.SDK_INT >= 34) {
                runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getPackageName()))));
            }
        }

        /** Abre a tela de bateria para o usuário marcar o app como "sem restrições" (evita avisos atrasados). */
        @JavascriptInterface
        public void abrirBateria() {
            runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)));
        }
    }
}
