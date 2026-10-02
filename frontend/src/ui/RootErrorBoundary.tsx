// Root error boundary — the smallest safe net for the Expo Router tree.
//
// Without this, a single render throw anywhere below the router produces a blank
// white screen (an App Store 2.1 rejection risk). It presents the shared State
// System's blocking-error surface with one recovery action.
//
// Rules: no stack trace, no error message, no URL, no owner id and no token is
// ever shown to a user; details are printed to the development console only; the
// reset action remounts the tree once per attempt and cannot loop.

import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";

import { BlockingError } from "@/src/ui/state";

export const ROOT_ERROR_COPY = {
  title: "Something went wrong",
  body: "The screen couldn’t be displayed. Your workouts, plan and history are saved on this device and are not affected.",
  action: "Reload the app",
} as const;

type Props = { children: React.ReactNode };
type State = { failed: boolean; attempt: number };

export class RootErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Diagnostics in development only. Nothing is sent anywhere: no telemetry.
    if (__DEV__) {
      console.error("[root-error-boundary]", error, info);
    }
  }

  reset = () => {
    // Changing the key remounts the subtree once; state.failed returns to false so
    // a repeated failure re-renders the fallback instead of looping.
    this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
  };

  render() {
    if (!this.state.failed) {
      return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    }
    return (
      <View style={styles.root} testID="root-error-boundary">
        <ScrollView contentContainerStyle={styles.scroll}>
          <BlockingError
            title={ROOT_ERROR_COPY.title}
            body={ROOT_ERROR_COPY.body}
            primary={{ label: ROOT_ERROR_COPY.action, onPress: this.reset, testID: "root-error-reset" }}
            testID="root-error-content"
          />
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  // Neutral surface so the fallback is legible in light and dark appearance
  // before any theme provider below the boundary has mounted.
  root: { flex: 1, backgroundColor: "#0e1729" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
});
