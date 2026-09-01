from __future__ import annotations

from hashlib import sha256
from pathlib import Path
import tempfile
import unittest

from publishing.adapters.r2 import R2AssetError, R2Config, R2ConfigurationError, R2OperationError, R2TemporaryMedia


class FakeR2:
    def __init__(self) -> None:
        self.uploads: list[tuple] = []
        self.presigns: list[tuple] = []
        self.deleted: list[tuple] = []

    def upload_file(self, Filename, Bucket, Key, ExtraArgs):
        self.uploads.append((Filename, Bucket, Key, ExtraArgs))

    def generate_presigned_url(self, ClientMethod, Params, ExpiresIn, HttpMethod):
        self.presigns.append((ClientMethod, Params, ExpiresIn, HttpMethod))
        return "https://" + "a" * 32 + ".r2.cloudflarestorage.com/signed?secret=not-for-repr"

    def delete_object(self, *, Bucket, Key):
        self.deleted.append((Bucket, Key))


class R2TemporaryMediaTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.asset = Path(self.tmp.name) / "original filename should never leak.mp4"
        self.asset.write_bytes(b"immutable mp4 bytes")
        self.digest = sha256(self.asset.read_bytes()).hexdigest()
        self.config = R2Config("a" * 32, "shortvideo-media", "access-id", "secret-value", 120)
        self.client = FakeR2()
        self.media = R2TemporaryMedia(self.config, client=self.client)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_environment_validation_and_redaction(self) -> None:
        config = R2Config.from_environment({
            "SHORTVIDEO_R2_ACCOUNT_ID": "a" * 32, "SHORTVIDEO_R2_BUCKET": "shortvideo-media",
            "SHORTVIDEO_R2_ACCESS_KEY_ID": "access-id", "SHORTVIDEO_R2_SECRET_ACCESS_KEY": "secret-value",
            "SHORTVIDEO_R2_TTL": "120",
        })
        self.assertEqual(config.endpoint_url, "https://" + "a" * 32 + ".r2.cloudflarestorage.com")
        self.assertNotIn("secret-value", repr(config))
        self.assertNotIn("access-id", repr(config))
        with self.assertRaises(R2ConfigurationError):
            R2Config.from_environment({})
        with self.assertRaises(R2ConfigurationError):
            R2Config.from_environment({"SHORTVIDEO_R2_ACCOUNT_ID": "bad", "SHORTVIDEO_R2_BUCKET": "x" * 3, "SHORTVIDEO_R2_ACCESS_KEY_ID": "a", "SHORTVIDEO_R2_SECRET_ACCESS_KEY": "b"})

    def test_stage_uses_opaque_deterministic_key_and_exact_s3_calls(self) -> None:
        staged = self.media.stage(publication_id="pub_1", target_id="instagram", asset_path=self.asset, asset_sha256=self.digest)
        key = f"temporary-media/pub_1/instagram/{self.digest}.mp4"
        self.assertEqual(staged.object_key, key)
        self.assertEqual(self.client.uploads, [(str(self.asset), "shortvideo-media", key, {"ContentType": "video/mp4", "Metadata": {"sha256": self.digest}})])
        self.assertEqual(self.client.presigns, [("get_object", {"Bucket": "shortvideo-media", "Key": key}, 120, "GET")])
        self.assertNotIn("signed?", repr(staged))
        self.assertNotIn("original filename", key)

    def test_cleanup_is_exact_and_rejects_unowned_namespace(self) -> None:
        key = self.media.object_key(publication_id="pub", target_id="instagram", asset_sha256=self.digest)
        self.media.cleanup(key)
        self.media.cleanup(key)
        self.assertEqual(self.client.deleted, [("shortvideo-media", key), ("shortvideo-media", key)])
        with self.assertRaises(R2AssetError):
            self.media.cleanup("elsewhere/object.mp4")

    def test_rejects_missing_symlink_and_digest_mismatch(self) -> None:
        with self.assertRaises(R2AssetError):
            self.media.stage(publication_id="pub", target_id="instagram", asset_path=Path(self.tmp.name) / "missing.mp4", asset_sha256=self.digest)
        with self.assertRaises(R2AssetError):
            self.media.stage(publication_id="pub", target_id="instagram", asset_path=self.asset, asset_sha256="0" * 64)
        link = Path(self.tmp.name) / "linked.mp4"
        link.symlink_to(self.asset)
        with self.assertRaises(R2AssetError):
            self.media.stage(publication_id="pub", target_id="instagram", asset_path=link, asset_sha256=self.digest)

    def test_missing_boto3_is_a_safe_configuration_error(self) -> None:
        def missing(_config):
            raise R2ConfigurationError("R2 support requires the optional boto3 dependency")
        with self.assertRaisesRegex(R2ConfigurationError, "optional boto3"):
            R2TemporaryMedia(self.config, client_factory=missing).stage(publication_id="pub", target_id="instagram", asset_path=self.asset, asset_sha256=self.digest)

    def test_runtime_client_error_is_redacted_operation_error(self) -> None:
        class BrokenR2(FakeR2):
            def upload_file(self, *args, **kwargs):
                raise RuntimeError("secret-value https://internal.example/?token=leak")
        with self.assertRaises(R2OperationError) as caught:
            R2TemporaryMedia(self.config, client=BrokenR2()).stage(publication_id="pub", target_id="instagram", asset_path=self.asset, asset_sha256=self.digest)
        self.assertNotIn("secret-value", str(caught.exception))
        self.assertNotIn("token=leak", str(caught.exception))

    def test_rejects_evil_https_presigned_url(self) -> None:
        class EvilR2(FakeR2):
            def generate_presigned_url(self, *args, **kwargs):
                return "https://attacker.example/signed#fragment"
        with self.assertRaises(R2OperationError):
            R2TemporaryMedia(self.config, client=EvilR2()).stage(publication_id="pub", target_id="instagram", asset_path=self.asset, asset_sha256=self.digest)

    def test_custom_endpoint_override_supports_non_cloudflare_s3_providers(self) -> None:
        """Backblaze B2 (and any other S3-compatible provider) has neither a
        Cloudflare-shaped 32-hex account id nor the r2.cloudflarestorage.com
        host, so an explicit endpoint override must bypass both."""
        config = R2Config.from_environment({
            "SHORTVIDEO_R2_ENDPOINT_URL": "https://s3.us-west-004.backblazeb2.com",
            "SHORTVIDEO_R2_REGION": "us-west-004",
            "SHORTVIDEO_R2_BUCKET": "shortvideo-media",
            "SHORTVIDEO_R2_ACCESS_KEY_ID": "b2-key-id",
            "SHORTVIDEO_R2_SECRET_ACCESS_KEY": "b2-application-key",
            "SHORTVIDEO_R2_TTL": "120",
        })
        self.assertEqual(config.endpoint_url, "https://s3.us-west-004.backblazeb2.com")
        self.assertEqual(config.region, "us-west-004")
        self.assertEqual(config.account_id, "")

        class FakeB2(FakeR2):
            def generate_presigned_url(self, *args, **kwargs):
                return "https://shortvideo-media.s3.us-west-004.backblazeb2.com/signed?secret=not-for-repr"

        asset = Path(self.tmp.name) / "b2 asset.mp4"
        asset.write_bytes(b"more immutable mp4 bytes")
        digest = sha256(asset.read_bytes()).hexdigest()
        media = R2TemporaryMedia(config, client=FakeB2())
        staged = media.stage(publication_id="pub_b2", target_id="instagram", asset_path=asset, asset_sha256=digest)
        self.assertTrue(staged.signed_url.startswith("https://shortvideo-media.s3.us-west-004.backblazeb2.com/"))

    def test_missing_account_id_without_endpoint_override_is_incomplete(self) -> None:
        with self.assertRaises(R2ConfigurationError):
            R2Config.from_environment({
                "SHORTVIDEO_R2_BUCKET": "shortvideo-media",
                "SHORTVIDEO_R2_ACCESS_KEY_ID": "a", "SHORTVIDEO_R2_SECRET_ACCESS_KEY": "b",
            })

    def test_invalid_endpoint_override_is_rejected(self) -> None:
        with self.assertRaises(R2ConfigurationError):
            R2Config.from_environment({
                "SHORTVIDEO_R2_ENDPOINT_URL": "http://not-https.example",
                "SHORTVIDEO_R2_BUCKET": "shortvideo-media",
                "SHORTVIDEO_R2_ACCESS_KEY_ID": "a", "SHORTVIDEO_R2_SECRET_ACCESS_KEY": "b",
            })

    def test_signed_url_from_wrong_provider_host_is_rejected_even_with_override(self) -> None:
        config = R2Config.from_environment({
            "SHORTVIDEO_R2_ENDPOINT_URL": "https://s3.us-west-004.backblazeb2.com",
            "SHORTVIDEO_R2_BUCKET": "shortvideo-media",
            "SHORTVIDEO_R2_ACCESS_KEY_ID": "a", "SHORTVIDEO_R2_SECRET_ACCESS_KEY": "b",
        })

        class WrongHostR2(FakeR2):
            def generate_presigned_url(self, *args, **kwargs):
                return "https://" + "a" * 32 + ".r2.cloudflarestorage.com/signed"

        with self.assertRaises(R2OperationError):
            R2TemporaryMedia(config, client=WrongHostR2()).stage(
                publication_id="pub", target_id="instagram",
                asset_path=self.asset, asset_sha256=self.digest,
            )


if __name__ == "__main__":
    unittest.main()
