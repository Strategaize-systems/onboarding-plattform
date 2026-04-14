import { ReviewClient } from "./review-client";

export default function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ReviewClient paramsPromise={params} />;
}
