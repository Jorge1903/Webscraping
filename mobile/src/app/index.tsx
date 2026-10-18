import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { APP_URL, navigationTarget } from '../navigation';

export default function MonitorScreen() {
  const web = useRef<WebView<object>>(null);
  const canGoBack = useRef(false);
  const [generation, setGeneration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current || failed) return false;
      web.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [failed]);

  const openExternal = (url: string) => {
    if (navigationTarget(url) !== 'external') return;
    void Linking.openURL(url).catch(() => Alert.alert('No se pudo abrir el enlace', 'Inténtalo de nuevo desde el navegador.'));
  };

  const retry = () => {
    canGoBack.current = false;
    setFailed(false);
    setLoading(true);
    setGeneration(value => value + 1);
  };

  return (
    <SafeAreaView style={styles.screen}>
      {!failed && <WebView<object>
        key={generation}
        ref={web}
        source={{ uri: APP_URL }}
        style={styles.web}
        // The same HTTPS origin owns the UI and API, including the HttpOnly session cookie.
        sharedCookiesEnabled
        thirdPartyCookiesEnabled={false}
        domStorageEnabled
        incognito={false}
        mixedContentMode="never"
        allowFileAccess={false}
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows
        originWhitelist={['https://*', 'http://*', 'about:*']}
        onShouldStartLoadWithRequest={request => {
          // Keep the sandboxed srcdoc product inspector inside the WebView.
          if (request.isTopFrame === false) return true;
          const target = navigationTarget(request.url);
          if (target === 'external') openExternal(request.url);
          return target === 'internal';
        }}
        onOpenWindow={event => openExternal(event.nativeEvent.targetUrl)}
        onNavigationStateChange={state => { canGoBack.current = state.canGoBack; }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setFailed(true); setLoading(false); }}
        onHttpError={event => {
          if (event.nativeEvent.url === APP_URL && event.nativeEvent.statusCode >= 400) {
            setFailed(true);
            setLoading(false);
          }
        }}
        onRenderProcessGone={retry}
        onContentProcessDidTerminate={retry}
      />}
      {loading && !failed && <View style={styles.loading} pointerEvents="none" accessibilityRole="progressbar" accessibilityLabel="Abriendo Scraping Monitor">
        <ActivityIndicator size="small" color="#5eead4" />
        <Text style={styles.loadingText}>Abriendo tu monitor…</Text>
      </View>}
      {failed && <View style={styles.error}>
        <Text style={styles.brand}>SCRAPING MONITOR</Text>
        <Text style={styles.title}>Volvamos a conectar</Text>
        <Text style={styles.description}>Revisa tu conexión a internet y vuelve a intentarlo. Si el servicio está despertando, puede tardar un momento.</Text>
        <Pressable accessibilityRole="button" onPress={retry} style={styles.button}>
          <Text style={styles.buttonText}>Reintentar</Text>
        </Pressable>
      </View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b111b' },
  web: { flex: 1, backgroundColor: '#0b111b' },
  loading: { position: 'absolute', top: '45%', alignSelf: 'center', flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#152334', padding: 18, borderRadius: 16 },
  loadingText: { color: '#e2e8f0', fontSize: 14 },
  error: { flex: 1, justifyContent: 'center', padding: 28, gap: 18, width: '100%', maxWidth: 520, alignSelf: 'center' },
  brand: { color: '#5eead4', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#f1f5f9', fontSize: 30, fontWeight: '700' },
  description: { color: '#aab9ce', fontSize: 16, lineHeight: 25 },
  button: { backgroundColor: '#5eead4', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#0b111b', fontSize: 16, fontWeight: '700' },
});
