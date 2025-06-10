/* eslint-disable @typescript-eslint/no-explicit-any */
import { observe } from "@legendapp/state";
import React from "react";
import { getObservableDataForKey } from "./ObservableData";

export default function withOnyx(mapOnyxToState: any) {
  return (WrappedComponent: React.ComponentType<any>) => {
    const displayName =
      WrappedComponent.displayName || WrappedComponent.name || "Component";

    class WithOnyx extends React.Component<any, any> {
      static displayName = `withOnyx(${displayName})`;
      subscriptions: { [key: string]: () => void } = {};

      constructor(props: any) {
        super(props);
        const initialState = Object.entries(mapOnyxToState).reduce(
          (state: any, [key, mapping]: [string, any]) => {
            const onyxKey =
              typeof mapping.key === "function"
                ? mapping.key(props)
                : mapping.key;
            const observableValue = getObservableDataForKey(onyxKey);
            state[key] = observableValue?.get() ?? mapping.initialValue;
            return state;
          },
          { loading: true }
        );

        this.state = initialState;
      }

      componentDidMount() {
        Object.entries(mapOnyxToState).forEach(
          ([key, mapping]: [string, any]) => {
            const onyxKey =
              typeof mapping.key === "function"
                ? mapping.key(this.props)
                : mapping.key;
            const observableValue = getObservableDataForKey(onyxKey);

            if (observableValue) {
              this.subscriptions[key] = observe(() => {
                const value = observableValue.get();
                this.setState((prevState: any) => ({
                  ...prevState,
                  [key]: value,
                  loading: false,
                }));
              });
            }
          }
        );
      }

      componentWillUnmount() {
        Object.keys(this.subscriptions).forEach((key) => {
          this.subscriptions[key]();
        });
      }

      render() {
        const { forwardedRef, ...rest } = this.props;

        return (
          <WrappedComponent ref={forwardedRef} {...rest} {...this.state} />
        );
      }
    }

    function forwardRefWrapper(props: any, ref: React.Ref<any>) {
      return <WithOnyx {...props} forwardedRef={ref} />;
    }

    forwardRefWrapper.displayName = `withOnyx(${displayName})`;

    return React.forwardRef(forwardRefWrapper);
  };
}
