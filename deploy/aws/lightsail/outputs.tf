output "candidate_public_ip" {
  value = aws_lightsail_instance.candidate.public_ip_address
}

output "production_ip" {
  value = aws_lightsail_static_ip.production.ip_address
}

output "instance_name" {
  value = aws_lightsail_instance.candidate.name
}

output "active_instance" {
  value = var.active_instance
}
