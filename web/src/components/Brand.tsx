import Image from "next/image";

/** Official amber / coral symbol; the source asset and its viewBox are unchanged. */
export function Brand() {
  return (
    <>
      <Image
        className="brand-mark"
        src="/brand/tala-mark.svg"
        width={44}
        height={44}
        alt=""
        priority
      />
      <span className="brand-name">TALA</span>
    </>
  );
}
