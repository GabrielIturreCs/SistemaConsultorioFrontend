import { Component,OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
@Component({
  selector: 'app-navbar',
  imports: [RouterLink, CommonModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent implements OnInit {
  isLoggedIn = false; //se cambia si el usuario está logueado 
  role = ''; //para el rol usuario y paciente

  ngOnInit(): void {
    this.updateNavbarState();
    window.addEventListener('storage', () => this.updateNavbarState());
  }

  updateNavbarState(): void {
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('rol');
    if (token) {
      this.isLoggedIn = true;
      this.role = userRole || '';
    } else {
      this.isLoggedIn = false;
      this.role = '';
    }
  }

  logout(): void {
    localStorage.clear();
    window.location.href = '/login';
    this.isLoggedIn = false;
    this.role = '';
  }
}
