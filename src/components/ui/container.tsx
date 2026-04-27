import type { ElementType, ReactNode } from "react";

type ContainerProps<TElement extends ElementType = "div"> = {
  as?: TElement;
  children: ReactNode;
  className?: string;
};

export function Container<TElement extends ElementType = "div">({
  as,
  children,
  className,
}: ContainerProps<TElement>) {
  const Component = as ?? "div";

  return (
    <Component
      className={[
        "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Component>
  );
}
