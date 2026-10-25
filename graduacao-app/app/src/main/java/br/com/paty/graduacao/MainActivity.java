package br.com.paty.graduacao;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;

/**
 * Casca do app Universidade: mostra as páginas guardadas dentro do próprio app (nada vem da internet)
 * e abre o seletor de arquivos para o PDF do histórico. Os dados ficam só neste aparelho (localStorage).
 */
public class MainActivity extends Activity {

    private static final String HOST = "graduacao.local";
    private static final int PEDIDO_ARQUIVO = 7;
    private WebView web;
    private ValueCallback<Uri[]> retorno;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        web = new WebView(this);
        setContentView(web);

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
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (retorno != null) retorno.onReceiveValue(null);
                retorno = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "Escolher arquivo"), PEDIDO_ARQUIVO);
                } catch (Exception e) {
                    retorno = null;
                    cb.onReceiveValue(null);
                }
                return true;
            }
        });
        web.loadUrl("https://" + HOST + "/");
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent dados) {
        if (pedido != PEDIDO_ARQUIVO || retorno == null) return;
        Uri[] r = null;
        if (resultado == RESULT_OK && dados != null && dados.getData() != null) r = new Uri[]{dados.getData()};
        retorno.onReceiveValue(r);
        retorno = null;
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    private static WebResourceResponse vazio() {
        return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
    }

    private static String tipo(String c) {
        if (c.endsWith(".html")) return "text/html";
        if (c.endsWith(".js") || c.endsWith(".mjs")) return "text/javascript";
        if (c.endsWith(".css")) return "text/css";
        if (c.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    /** Ponte para a página: compartilhar o backup pela folha de compartilhamento do Android. */
    private class Ponte {
        @JavascriptInterface
        public void compartilhar(String titulo, String texto) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_SUBJECT, titulo);
                i.putExtra(Intent.EXTRA_TEXT, texto);
                startActivity(Intent.createChooser(i, titulo));
            });
        }
    }
}
